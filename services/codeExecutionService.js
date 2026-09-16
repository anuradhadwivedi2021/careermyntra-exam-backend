// ============================================
// CareerMyntra Exam Portal - Code Execution Service
// ============================================
//
// Supports both interpreted languages (run directly) and compiled
// languages (compile step -> run the compiled artifact).
//
// IMPORTANT (ops note): this runs candidate code directly on the host via
// execFile with a timeout — it is NOT container-isolated. Adding more
// languages only widens the attack surface (arbitrary compilers running on
// the host). Before enabling this in production with untrusted candidates,
// move execution into a locked-down sandbox (e.g. a per-submission Docker
// container / firecracker VM / gVisor, no network, capped CPU+memory,
// non-root user, read-only fs). Treat this file as functionally complete
// but NOT security-complete.
//
// Each language also requires its compiler/runtime to be installed on the
// machine running this service (see the comment above each entry below).
// On Render's default Node web service these are NOT present — you'd need
// a custom Docker-based deploy (or a separate sandboxed execution service)
// to get anything beyond Node/Python working.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---- helper: run one program with stdin piped in, resolve with output/error ----
function execWithInput(cmd, args, cwd, input, timeoutMs, callback) {
  let settled = false;
  const child = execFile(
    cmd,
    args,
    { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' },
    (err, stdout, stderr) => {
      if (settled) return;
      settled = true;
      if (err) {
        if (err.killed || err.signal === 'SIGKILL') {
          return callback({ ranOk: false, output: stdout || '', error: 'Time limit exceeded' });
        }
        return callback({ ranOk: false, output: stdout || '', error: (stderr || err.message || '').slice(0, 2000) });
      }
      callback({ ranOk: true, output: stdout || '', error: (stderr || '').slice(0, 2000) });
    }
  );

  child.on('error', (e) => {
    if (settled) return;
    settled = true;
    callback({ ranOk: false, output: '', error: `Could not start ${cmd}: ${e.message}` });
  });

  try {
    child.stdin.write(input || '');
    child.stdin.end();
  } catch (e) {
    // process may have already exited (e.g. bad code) - ignore write errors
  }
}

// ---- helper: compile with a fixed (generous) compile timeout, separate from run timeout ----
const COMPILE_TIMEOUT_MS = 15000;

function compileOnce(cmd, args, cwd, callback) {
  execFile(cmd, args, { cwd, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      const msg = err.killed
        ? 'Compilation timed out'
        : (stderr || stdout || err.message || 'Compilation failed').slice(0, 2000);
      return callback({ ok: false, error: `Compilation error:\n${msg}` });
    }
    callback({ ok: true });
  });
}

// Each entry:
//   extension   - source file extension
//   filename    - (optional) fixed source filename required by the toolchain (e.g. Java)
//   compile     - (optional) (filePath, outputPath, tmpDir) => { cmd, args, cwd }
//   run         - (filePath, tmpDir, outputPath) => { cmd, args, cwd }
const LANGUAGE_CONFIG = {
  // ---- interpreted: run directly, no compile step ----
  javascript: {
    extension: 'js',
    run: (filePath) => ({ cmd: 'node', args: [filePath] }),
  },
  typescript: {
    // requires: npm i -g typescript ts-node  (or swap for a tsc-then-node compile step)
    extension: 'ts',
    run: (filePath) => ({ cmd: 'npx', args: ['--yes', 'ts-node', '--transpile-only', filePath] }),
  },
  python: {
    extension: 'py',
    run: (filePath) => ({ cmd: 'python3', args: [filePath] }),
  },
  ruby: {
    // requires: ruby installed
    extension: 'rb',
    run: (filePath) => ({ cmd: 'ruby', args: [filePath] }),
  },
  php: {
    // requires: php-cli installed
    extension: 'php',
    run: (filePath) => ({ cmd: 'php', args: [filePath] }),
  },
  go: {
    // requires: go toolchain installed ('go run' compiles+runs in one shot)
    extension: 'go',
    run: (filePath) => ({ cmd: 'go', args: ['run', filePath] }),
  },

  // ---- compiled: compile step produces a binary, then run the binary ----
  c: {
    // requires: gcc
    extension: 'c',
    compile: (filePath, outputPath) => ({ cmd: 'gcc', args: [filePath, '-O2', '-lm', '-o', outputPath] }),
    run: (filePath, tmpDir, outputPath) => ({ cmd: outputPath, args: [] }),
  },
  cpp: {
    // requires: g++
    extension: 'cpp',
    compile: (filePath, outputPath) => ({ cmd: 'g++', args: [filePath, '-O2', '-std=c++17', '-o', outputPath] }),
    run: (filePath, tmpDir, outputPath) => ({ cmd: outputPath, args: [] }),
  },
  java: {
    // requires: JDK (javac + java on PATH). Candidate code must declare
    // `public class Main { public static void main(String[] args) ... }`
    // because the source file is always written out as Main.java.
    extension: 'java',
    filename: 'Main.java',
    compile: (filePath, outputPath, tmpDir) => ({ cmd: 'javac', args: [filePath], cwd: tmpDir }),
    run: (filePath, tmpDir) => ({ cmd: 'java', args: ['-cp', tmpDir, 'Main'], cwd: tmpDir }),
  },
  csharp: {
    // requires: mono-complete (provides `mcs` compiler + `mono` runtime)
    extension: 'cs',
    compile: (filePath, outputPath) => ({ cmd: 'mcs', args: ['-out:' + outputPath, filePath] }),
    run: (filePath, tmpDir, outputPath) => ({ cmd: 'mono', args: [outputPath] }),
  },
  rust: {
    // requires: rustc
    extension: 'rs',
    compile: (filePath, outputPath) => ({ cmd: 'rustc', args: [filePath, '-O', '-o', outputPath] }),
    run: (filePath, tmpDir, outputPath) => ({ cmd: outputPath, args: [] }),
  },
  kotlin: {
    // requires: kotlinc (slow to compile — give it the full COMPILE_TIMEOUT_MS)
    extension: 'kt',
    compile: (filePath, outputPath) => ({ cmd: 'kotlinc', args: [filePath, '-include-runtime', '-d', outputPath] }),
    run: (filePath, tmpDir, outputPath) => ({ cmd: 'java', args: ['-jar', outputPath] }),
  },
};

const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG);

function runOnce(code, language, input, timeoutMs) {
  return new Promise((resolve) => {
    const config = LANGUAGE_CONFIG[language];
    if (!config) {
      return resolve({ ranOk: false, output: '', error: `Unsupported language: ${language}` });
    }

    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-code-'));
    } catch (e) {
      return resolve({ ranOk: false, output: '', error: 'Could not prepare sandbox' });
    }

    const sourceFileName = config.filename || `solution.${config.extension}`;
    const filePath = path.join(tmpDir, sourceFileName);
    const outputPath = path.join(tmpDir, os.platform() === 'win32' ? 'solution.exe' : 'solution.out');

    try {
      fs.writeFileSync(filePath, code || '');
    } catch (e) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return resolve({ ranOk: false, output: '', error: 'Could not write submission file' });
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      fs.rmSync(tmpDir, { recursive: true, force: true });
      resolve(result);
    };

    const doRun = () => {
      const { cmd, args, cwd } = config.run(filePath, tmpDir, outputPath);
      execWithInput(cmd, args, cwd || tmpDir, input, timeoutMs, finish);
    };

    if (config.compile) {
      const { cmd, args, cwd } = config.compile(filePath, outputPath, tmpDir);
      compileOnce(cmd, args, cwd || tmpDir, (compileResult) => {
        if (!compileResult.ok) {
          return finish({ ranOk: false, output: '', error: compileResult.error });
        }
        doRun();
      });
    } else {
      doRun();
    }
  });
}

async function runTestCases(code, language, testCases, timeoutSeconds = 2) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return testCases.map((tc) => ({
      test_case_id: tc.test_case_id,
      is_hidden: tc.is_hidden,
      passed: false,
      error: `Unsupported language: ${language}`,
    }));
  }

  const timeoutMs = Math.max(1, Number(timeoutSeconds) || 2) * 1000;
  const results = [];

  for (const tc of testCases) {
    const run = await runOnce(code, language, tc.input || '', timeoutMs);
    const actualOutput = (run.output || '').trim();
    const expectedOutput = (tc.expected_output || '').trim();
    const passed = run.ranOk && actualOutput === expectedOutput;

    const entry = {
      test_case_id: tc.test_case_id,
      is_hidden: !!tc.is_hidden,
      passed,
      error: run.error || null,
    };

    if (!tc.is_hidden) {
      entry.input = tc.input || '';
      entry.expected_output = expectedOutput;
      entry.actual_output = actualOutput;
    }

    results.push(entry);
  }

  return results;
}

module.exports = { runTestCases, SUPPORTED_LANGUAGES };