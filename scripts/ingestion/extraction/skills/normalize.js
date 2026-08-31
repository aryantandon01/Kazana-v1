/** Canonical skill aliases → display name + slug */

const ALIAS_TO_CANONICAL = {
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  golang: 'Go',
  go: 'Go',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  node: 'Node.js',
  'react.js': 'React',
  reactjs: 'React',
  react: 'React',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  'vue.js': 'Vue',
  vuejs: 'Vue',
  'spring boot': 'Spring',
  'spring framework': 'Spring',
  'java spring': 'Spring',
  spring: 'Spring',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  'c++': 'C++',
  cpp: 'C++',
  'c#': 'C#',
  csharp: 'C#',
  aws: 'AWS',
  gcp: 'GCP',
  'google cloud': 'GCP',
  azure: 'Azure',
  tensorflow: 'TensorFlow',
  pytorch: 'PyTorch',
  llms: 'LLMs',
  llm: 'LLMs',
};

export function normalizeSkillSlug(value) {
  if (!value) return '';
  const raw = String(value).toLowerCase().trim();
  const canon = ALIAS_TO_CANONICAL[raw] || ALIAS_TO_CANONICAL[raw.replace(/_/g, ' ')];
  const name = canon || String(value).trim();
  return name
    .toLowerCase()
    .replace(/\+/g, 'p')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function canonicalizeSkillName(value) {
  if (!value) return '';
  const raw = String(value).toLowerCase().trim();
  return (
    ALIAS_TO_CANONICAL[raw] ||
    ALIAS_TO_CANONICAL[raw.replace(/_/g, ' ')] ||
    String(value).trim()
  );
}

export { ALIAS_TO_CANONICAL };
