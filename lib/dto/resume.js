/**
 * Strip private fields from resume records for public API responses.
 */
export function toPublicResume(resume) {
  if (!resume) return resume;
  const { name, user_id, ...publicFields } = resume;
  return publicFields;
}

export function toOwnerResume(resume) {
  return resume;
}

export function toPublicResumes(resumes) {
  return (resumes || []).map(toPublicResume);
}
