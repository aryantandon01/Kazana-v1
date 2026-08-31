/** Career Area facets — multi-valued structured classification for jobs. */

export const CAREER_AREAS = [
  { value: 'ai', label: 'AI' },
  { value: 'machine_learning', label: 'Machine Learning' },
  { value: 'backend', label: 'Backend' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'full_stack', label: 'Full Stack' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'security', label: 'Security' },
  { value: 'devops', label: 'DevOps' },
  { value: 'data', label: 'Data' },
  { value: 'product', label: 'Product' },
  { value: 'design', label: 'Design' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'finance', label: 'Finance' },
  { value: 'legal', label: 'Legal' },
  { value: 'hr', label: 'HR' },
  { value: 'operations', label: 'Operations' },
  { value: 'it', label: 'IT' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'quantitative', label: 'Quantitative' },
  { value: 'management', label: 'Engineering Management' },
];

export const EXPERIENCE_LEVELS = [
  { value: 'intern', label: 'Intern' },
  { value: 'new_grad', label: 'New Grad' },
  { value: 'entry', label: 'Entry Level' },
  { value: 'mid', label: 'Mid Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: 'principal', label: 'Principal' },
  { value: 'director', label: 'Director' },
];

export function getCareerAreaByValue(value) {
  return CAREER_AREAS.find((area) => area.value === value) || null;
}
