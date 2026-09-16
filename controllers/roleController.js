const pool = require('../config/db');
const { logAction } = require('../services/auditLogger');

// ============ ADMIN: GET ALL ROLES + PERMISSION MATRIX + ADMIN COUNTS ============
exports.getAllRoles = async (req, res) => {
  try {
    const rolesResult = await pool.query('SELECT * FROM admin_roles ORDER BY created_at');
    const permsResult = await pool.query('SELECT * FROM role_permissions');
    const countsResult = await pool.query(
      'SELECT role AS role_id, COUNT(*)::int AS admin_count FROM admins GROUP BY role'
    );
    const modulesResult = await pool.query(
      'SELECT module_name FROM permission_modules ORDER BY display_order'
    );

    const modules = modulesResult.rows.map((r) => r.module_name);
    const countsMap = Object.fromEntries(countsResult.rows.map((r) => [r.role_id, r.admin_count]));

    const roles = rolesResult.rows.map((role) => {
      const access = {};
      modules.forEach((m) => { access[m] = false; });
      permsResult.rows
        .filter((p) => p.role_id === role.role_id)
        .forEach((p) => { access[p.module_name] = p.has_access; });

      return {
        id: role.role_id,
        name: role.name,
        description: role.description,
        is_system: role.is_system,
        adminCount: countsMap[role.role_id] || 0,
        access,
      };
    });

    res.json({ success: true, modules, roles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: CREATE A NEW ROLE ("Add role" button) ============
exports.createRole = async (req, res) => {
  const { role_id, name, description } = req.body;

  if (!role_id || !name) {
    return res.status(400).json({ success: false, message: 'role_id and name are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO admin_roles (role_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [role_id, name, description || null]
    );

    // New role starts with no access to any module — admin turns modules on afterwards
    await pool.query(
      `INSERT INTO role_permissions (role_id, module_name, has_access)
       SELECT $1, module_name, FALSE FROM permission_modules
       ON CONFLICT (role_id, module_name) DO NOTHING`,
      [role_id]
    );

    await logAction(req, { action: `Created new role "${name}"`, module: 'Settings' });
    res.status(201).json({ success: true, message: 'Role created', role: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A role with this id already exists' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: UPDATE A ROLE'S MODULE ACCESS ============
exports.updatePermissions = async (req, res) => {
  const { role_id } = req.params;
  const { access } = req.body; // { "Dashboard": true, "Exams": false, ... }

  if (!access || typeof access !== 'object' || Array.isArray(access)) {
    return res.status(400).json({ success: false, message: 'access object is required' });
  }

  try {
    const roleCheck = await pool.query('SELECT is_system FROM admin_roles WHERE role_id = $1', [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    if (roleCheck.rows[0].is_system) {
      return res.status(403).json({ success: false, message: 'Super admin always has full access and cannot be changed' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [module_name, has_access] of Object.entries(access)) {
      await client.query(
        `INSERT INTO role_permissions (role_id, module_name, has_access)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, module_name) DO UPDATE SET has_access = EXCLUDED.has_access`,
        [role_id, module_name, !!has_access]
      );
    }

    await client.query('COMMIT');
    await logAction(req, { action: `Updated permissions for role "${role_id}"`, module: 'Settings' });
    res.json({ success: true, message: 'Permissions saved' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};