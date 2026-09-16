// Higher number = higher qualification. Used to check "at least X" requirements.
const QUALIFICATION_RANK = { '10th': 1, '12th': 2, diploma: 3, graduate: 4, postgraduate: 5 };

function calculateAge(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Checks a candidate against an exam's eligibility configuration.
// exam: { has_eligibility_criteria, min_qualification, min_age, max_age, gender_restriction }
// candidate: { date_of_birth, gender, qualification }
// Returns { eligible: true } or { eligible: false, message: '...' }.
function checkEligibility(exam, candidate) {
  if (!exam.has_eligibility_criteria) return { eligible: true };

  if (exam.min_qualification && exam.min_qualification !== 'none') {
    if (!candidate.qualification) {
      return { eligible: false, message: 'Please add your qualification in your profile before registering for this exam.' };
    }
    const candidateRank = QUALIFICATION_RANK[candidate.qualification] || 0;
    const requiredRank = QUALIFICATION_RANK[exam.min_qualification] || 0;
    if (candidateRank < requiredRank) {
      return { eligible: false, message: `This exam requires a minimum qualification of ${exam.min_qualification}.` };
    }
  }

  if (exam.min_age || exam.max_age) {
    if (!candidate.date_of_birth) {
      return { eligible: false, message: 'Please add your date of birth in your profile before registering for this exam.' };
    }
    const age = calculateAge(candidate.date_of_birth);
    if (exam.min_age && age < exam.min_age) {
      return { eligible: false, message: `You must be at least ${exam.min_age} years old to register for this exam.` };
    }
    if (exam.max_age && age > exam.max_age) {
      return { eligible: false, message: `This exam is open to candidates up to ${exam.max_age} years old.` };
    }
  }

  if (exam.gender_restriction && exam.gender_restriction !== 'any') {
    if (!candidate.gender) {
      return { eligible: false, message: 'Please add your gender in your profile before registering for this exam.' };
    }
    if (candidate.gender !== exam.gender_restriction) {
      return { eligible: false, message: `This exam is open to ${exam.gender_restriction} candidates only.` };
    }
  }

  return { eligible: true };
}

module.exports = { checkEligibility, calculateAge };