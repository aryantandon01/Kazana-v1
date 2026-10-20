/**
 * Semantic classification catalogs for Facets (structured) and Tags (open-ended).
 * Used by the rule-based classifier; AI enrichment can add more tags later.
 */

/** @type {{ value: string, label: string, patterns: RegExp[], titleOnly?: boolean }[]} */
export const CAREER_AREA_RULES = [
  {
    // Bare "AI" is a strong *title* signal ("AI Engineer") but appears in almost
    // every JD body ("we use AI…"), so it must never decide the primary career
    // area on its own. `titleOnly` keeps body noise out of job_family.
    value: 'ai',
    label: 'AI',
    titleOnly: true,
    patterns: [/\bai\b/i, /\bgenai\b/i, /\bgen ai\b/i, /\bai\/(?:ml|engineer)\b/i],
  },
  {
    value: 'ai',
    label: 'AI',
    patterns: [
      /\bartificial intelligence\b/i,
      /\bgenerative ai\b/i,
      /\bllm\b/i,
      /\blarge language model/i,
      /\bagentic\b/i,
    ],
  },
  {
    value: 'machine_learning',
    label: 'Machine Learning',
    patterns: [
      /\bmachine learning\b/i,
      /\bml engineer/i,
      /\bdeep learning\b/i,
      /\bneural network/i,
      /\bpytorch\b/i,
      /\btensorflow\b/i,
      /\bcomputer vision\b/i,
      /\bnlp\b/i,
    ],
  },
  {
    value: 'backend',
    label: 'Backend',
    patterns: [
      /\bbackend\b/i,
      /\bback-end\b/i,
      /\bserver[- ]side\b/i,
      /\bapi engineer/i,
      /\bplatform engineer/i,
      /\bdistributed systems?\b/i,
      /\bmicroservices?\b/i,
      // Generic engineering titles: without these they fall through to a
      // body-only "AI" match and get mislabelled ai_engineer.
      /\bsoftware engineer/i,
      /\bsoftware developer/i,
      /\bsoftware development engineer/i,
      /\bapplication developer\b/i,
      /\bprogrammer\b/i,
    ],
  },
  {
    value: 'frontend',
    label: 'Frontend',
    patterns: [
      /\bfrontend\b/i,
      /\bfront-end\b/i,
      /\bui engineer/i,
      /\breact\.?js\b/i,
      /\breact native\b/i,
      /\breact hooks?\b/i,
      // Capital-R "React" (skill lists); avoid English verb "react well/to/under"
      /(?:^|[^a-z])React(?=[^a-z]|$)/,
      /\bvue\.?js\b/i,
      /\bangular\b/i,
      /\bweb client\b/i,
    ],
  },
  {
    value: 'full_stack',
    label: 'Full Stack',
    patterns: [/\bfull[- ]?stack\b/i],
  },
  {
    value: 'cloud',
    label: 'Cloud',
    patterns: [
      /\bcloud\b/i,
      /\baws\b/i,
      /\bazure\b/i,
      /\bgcp\b/i,
      /\bgoogle cloud\b/i,
      /\bkubernetes\b/i,
      /\bk8s\b/i,
    ],
  },
  {
    value: 'security',
    label: 'Security',
    patterns: [
      /\bsecurity engineer/i,
      /\bcybersecurity\b/i,
      /\bappsec\b/i,
      /\binfosec\b/i,
      /\bpenetration test/i,
    ],
  },
  {
    value: 'devops',
    label: 'DevOps',
    patterns: [
      /\bdevops\b/i,
      /\bsite reliability\b/i,
      /\bsre\b/i,
      /\binfrastructure engineer/i,
      /\bci\/?cd\b/i,
    ],
  },
  {
    value: 'data',
    label: 'Data',
    patterns: [
      /\bdata engineer/i,
      /\bdata scientist/i,
      /\bdata analyst/i,
      /\banalytics engineer/i,
      /\bbig data\b/i,
      /\betal\b/i,
    ],
  },
  {
    value: 'product',
    label: 'Product',
    patterns: [
      /\bproduct manager\b/i,
      /\bproduct management\b/i,
      /\bproduct owner\b/i,
      /\bproduct lead\b/i,
      /\bpm\b/i,
    ],
  },
  {
    value: 'design',
    label: 'Design',
    patterns: [
      /\bproduct designer\b/i,
      /\bux designer\b/i,
      /\bui designer\b/i,
      /\bux researcher\b/i,
      /\bgraphic designer\b/i,
      /\bdesigner\b/i,
      /\bux\b/i,
      /\bui\b/i,
    ],
  },
  {
    value: 'sales',
    label: 'Sales',
    patterns: [
      /\baccount executive\b/i,
      /\bsales engineer\b/i,
      /\bbusiness development\b/i,
      /\brevenue\b/i,
      /\bsolutions? engineer\b/i,
      /\btechnical account manager\b/i,
      /\bcustomer success\b/i,
      /\bsales (?:manager|director|lead|development)\b/i,
      /\baccount (?:director|manager)\b/i,
      /\bpartner (?:manager|development|director)\b/i,
      /\bpre-?sales\b/i,
    ],
  },
  {
    value: 'marketing',
    label: 'Marketing',
    patterns: [
      /\bmarketing\b/i,
      /\bgrowth\b/i,
      /\bproduct marketing\b/i,
      /\bbrand\b/i,
      /\bcontent\b/i,
      /\bcommunications\b/i,
      /\bpublic relations\b/i,
      /\bseo\b/i,
      /\bsocial media\b/i,
      /\blifecycle\b/i,
      /\bdemand gen/i,
    ],
  },
  {
    value: 'finance',
    label: 'Finance',
    patterns: [
      /\bfinancial analyst\b/i,
      /\binvestment banker\b/i,
      /\bfinance\b/i,
      /\btreasury\b/i,
      /\baccountant\b/i,
      /\baccounts (?:payable|receivable)\b/i,
      /\bpayroll\b/i,
      /\b(?:financial|assistant|corporate|division) controller\b/i,
    ],
  },
  {
    value: 'legal',
    label: 'Legal',
    patterns: [
      /\blegal\b/i,
      /\bcompliance\b/i,
      /\bcounsel\b/i,
      /\battorney\b/i,
      /\blawyer\b/i,
      /\bparalegal\b/i,
      /\bcontracts? manager\b/i,
      /\bcompliance officer\b/i,
    ],
  },
  {
    value: 'hr',
    label: 'HR',
    patterns: [
      /\brecruiter\b/i,
      /\brecruiting\b/i,
      /\bsourcer\b/i,
      /\btalent (?:acquisition|sourcing|partner)\b/i,
      /\bpeople (?:ops|operations)\b/i,
      /\bhuman resources\b/i,
      /\bhr\b/i,
    ],
  },
  {
    value: 'operations',
    label: 'Operations',
    patterns: [/\boperations\b/i, /\bchief of staff\b/i, /\bbusiness operations\b/i],
  },
  {
    value: 'administration',
    label: 'Administration',
    patterns: [
      /\badministrative\b/i,
      /\badmin(?:istrative)? coordinator\b/i,
      /\bexecutive assistant\b/i,
      /\boffice (?:manager|coordinator|assistant)\b/i,
      /\breceptionist\b/i,
      /\bpersonal assistant\b/i,
    ],
  },
  {
    value: 'it',
    label: 'IT',
    patterns: [/\bit support\b/i, /\bsystems administrator\b/i, /\bhelp desk\b/i],
  },
  {
    value: 'hardware',
    label: 'Hardware',
    patterns: [
      /\bhardware engineer/i,
      /\belectrical engineer/i,
      /\bmechanical engineer/i,
      /\bmechanical design engineer/i,
      /\bmanufacturing engineer/i,
      /\bfirmware\b/i,
      /\basic\b/i,
      /\bpcb\b/i,
    ],
  },
  {
    value: 'quantitative',
    label: 'Quantitative',
    patterns: [/\bquant\b/i, /\bquantitative\b/i, /\balgorithmic trad/i],
  },
  {
    value: 'management',
    label: 'Engineering Management',
    patterns: [
      /\bengineering manager\b/i,
      /\bsoftware engineering manager\b/i,
      /\btechnical program manager\b/i,
      /\btpm\b/i,
    ],
  },
];

/** @type {{ value: string, label: string, patterns: RegExp[] }[]} */
export const EXPERIENCE_LEVEL_RULES = [
  // Highest seniority first — descriptions often mention lower bands too
  { value: 'director', label: 'Director', patterns: [/\bdirector\b/i, /\bhead of\b/i, /\bvp\b/i, /\bvice president\b/i] },
  { value: 'principal', label: 'Principal', patterns: [/\bprincipal\b/i, /\bdistinguished\b/i] },
  { value: 'staff', label: 'Staff', patterns: [/\bstaff\b/i] },
  { value: 'senior', label: 'Senior', patterns: [/\bsenior\b/i, /\bsr\.?\b/i] },
  { value: 'mid', label: 'Mid Level', patterns: [/\bmid[- ]level\b/i, /\bintermediate\b/i] },
  { value: 'entry', label: 'Entry Level', patterns: [/\bentry[- ]level\b/i, /\bjunior\b/i, /\bearly career\b/i] },
  { value: 'new_grad', label: 'New Grad', patterns: [/\bnew grad\b/i, /\buniversity grad\b/i, /\brecent graduate\b/i] },
  { value: 'intern', label: 'Intern', patterns: [/\bintern(ship)?\b/i] },
];

/** @type {{ value: string, label: string, patterns: RegExp[] }[]} */
export const EMPLOYMENT_TYPE_RULES = [
  { value: 'internship', label: 'Internship', patterns: [/\binternship\b/i, /\bintern\b/i] },
  { value: 'contract', label: 'Contract', patterns: [/\bcontract(or)?\b/i, /\bfreelance\b/i] },
  { value: 'part_time', label: 'Part Time', patterns: [/\bpart[- ]time\b/i] },
  { value: 'temporary', label: 'Temporary', patterns: [/\btemporary\b/i, /\btemp\b/i] },
  { value: 'full_time', label: 'Full Time', patterns: [/\bfull[- ]time\b/i, /\bpermanent\b/i] },
];

/** @type {{ value: string, label: string, patterns: RegExp[] }[]} */
export const WORK_ARRANGEMENT_RULES = [
  { value: 'remote', label: 'Remote', patterns: [/\bremote\b/i, /\bwork from (home|anywhere)\b/i, /\bwfh\b/i, /\bworldwide\b/i] },
  { value: 'hybrid', label: 'Hybrid', patterns: [/\bhybrid\b/i] },
  { value: 'onsite', label: 'On-site', patterns: [/\bon[- ]?site\b/i, /\bin[- ]office\b/i] },
];

/**
 * Tag lexicon: longer phrases first so "Next.js" wins over "Next".
 * @type {{ name: string, slug: string, category: string, patterns: RegExp[] }[]}
 */
export const TAG_LEXICON = [
  { name: 'Next.js', slug: 'nextjs', category: 'framework', patterns: [/\bnext\.?js\b/i] },
  { name: 'Node.js', slug: 'nodejs', category: 'framework', patterns: [/\bnode\.?js\b/i] },
  { name: 'TypeScript', slug: 'typescript', category: 'programming_language', patterns: [/\btypescript\b/i] },
  { name: 'JavaScript', slug: 'javascript', category: 'programming_language', patterns: [/\bjavascript\b/i] },
  { name: 'Python', slug: 'python', category: 'programming_language', patterns: [/\bpython\b/i] },
  { name: 'C++', slug: 'cpp', category: 'programming_language', patterns: [/\bc\+\+\b/i] },
  { name: 'C#', slug: 'csharp', category: 'programming_language', patterns: [/\bc#\b/i] },
  { name: 'Go', slug: 'go', category: 'programming_language', patterns: [/\bgolang\b/i, /(?:^|[\s,/(])go(?:[\s,)/]|$)/i] },
  { name: 'Rust', slug: 'rust', category: 'programming_language', patterns: [/\brust\b/i] },
  { name: 'Java', slug: 'java', category: 'programming_language', patterns: [/\bjava\b/i] },
  { name: 'Swift', slug: 'swift', category: 'programming_language', patterns: [/\bswift\b/i] },
  { name: 'Kotlin', slug: 'kotlin', category: 'programming_language', patterns: [/\bkotlin\b/i] },
  { name: 'Ruby', slug: 'ruby', category: 'programming_language', patterns: [/\bruby\b/i] },
  { name: 'PHP', slug: 'php', category: 'programming_language', patterns: [/\bphp\b/i] },
  { name: 'Scala', slug: 'scala', category: 'programming_language', patterns: [/\bscala\b/i] },
  { name: 'SQL', slug: 'sql', category: 'programming_language', patterns: [/\bsql\b/i] },
  { name: 'React', slug: 'react', category: 'framework', patterns: [
    /\breact\.?js\b/i,
    /\breact native\b/i,
    /\breact hooks?\b/i,
    /(?:^|[^a-z])React(?=[^a-z]|$)/,
  ] },
  { name: 'Vue', slug: 'vue', category: 'framework', patterns: [/\bvue\.?js\b/i, /\bvue\b/i] },
  { name: 'Angular', slug: 'angular', category: 'framework', patterns: [/\bangular\b/i] },
  { name: 'Django', slug: 'django', category: 'framework', patterns: [/\bdjango\b/i] },
  { name: 'Flask', slug: 'flask', category: 'framework', patterns: [/\bflask\b/i] },
  { name: 'FastAPI', slug: 'fastapi', category: 'framework', patterns: [/\bfastapi\b/i] },
  { name: 'Spring', slug: 'spring', category: 'framework', patterns: [/\bspring boot\b/i, /\bspring\b/i] },
  { name: 'Rails', slug: 'rails', category: 'framework', patterns: [/\brails\b/i, /\bruby on rails\b/i] },
  { name: '.NET', slug: 'dotnet', category: 'framework', patterns: [/\b\.net\b/i, /\bdotnet\b/i] },
  { name: 'GraphQL', slug: 'graphql', category: 'framework', patterns: [/\bgraphql\b/i] },
  { name: 'AWS', slug: 'aws', category: 'cloud', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { name: 'Azure', slug: 'azure', category: 'cloud', patterns: [/\bazure\b/i] },
  { name: 'GCP', slug: 'gcp', category: 'cloud', patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
  { name: 'Snowflake', slug: 'snowflake', category: 'cloud', patterns: [/\bsnowflake\b/i] },
  { name: 'Databricks', slug: 'databricks', category: 'cloud', patterns: [/\bdatabricks\b/i] },
  { name: 'Docker', slug: 'docker', category: 'infrastructure', patterns: [/\bdocker\b/i] },
  { name: 'Kubernetes', slug: 'kubernetes', category: 'infrastructure', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { name: 'Terraform', slug: 'terraform', category: 'infrastructure', patterns: [/\bterraform\b/i] },
  { name: 'CI/CD', slug: 'cicd', category: 'infrastructure', patterns: [/\bci\/?cd\b/i] },
  { name: 'Linux', slug: 'linux', category: 'infrastructure', patterns: [/\blinux\b/i] },
  { name: 'PostgreSQL', slug: 'postgresql', category: 'database', patterns: [/\bpostgres(ql)?\b/i] },
  { name: 'MySQL', slug: 'mysql', category: 'database', patterns: [/\bmysql\b/i] },
  { name: 'MongoDB', slug: 'mongodb', category: 'database', patterns: [/\bmongodb\b/i] },
  { name: 'Redis', slug: 'redis', category: 'database', patterns: [/\bredis\b/i] },
  { name: 'Elasticsearch', slug: 'elasticsearch', category: 'database', patterns: [/\belasticsearch\b/i] },
  { name: 'Vector Databases', slug: 'vector-databases', category: 'database', patterns: [/\bvector (db|database|store)\b/i, /\bpinecone\b/i, /\bweaviate\b/i, /\bchroma\b/i] },
  { name: 'TensorFlow', slug: 'tensorflow', category: 'ai', patterns: [/\btensorflow\b/i] },
  { name: 'PyTorch', slug: 'pytorch', category: 'ai', patterns: [/\bpytorch\b/i] },
  { name: 'CUDA', slug: 'cuda', category: 'ai', patterns: [/\bcuda\b/i] },
  { name: 'LLMs', slug: 'llms', category: 'ai', patterns: [/\bllms?\b/i, /\blarge language model/i] },
  { name: 'RAG', slug: 'rag', category: 'ai', patterns: [/\brag\b/i, /\bretrieval[- ]augmented\b/i] },
  { name: 'LangGraph', slug: 'langgraph', category: 'ai', patterns: [/\blanggraph\b/i] },
  { name: 'Agents', slug: 'agents', category: 'ai', patterns: [/\bai agents?\b/i, /\bagentic\b/i] },
  { name: 'NLP', slug: 'nlp', category: 'ai', patterns: [/\bnlp\b/i, /\bnatural language\b/i] },
  { name: 'Computer Vision', slug: 'computer-vision', category: 'ai', patterns: [/\bcomputer vision\b/i] },
  { name: 'Distributed Systems', slug: 'distributed-systems', category: 'domain', patterns: [/\bdistributed systems?\b/i] },
  { name: 'Microservices', slug: 'microservices', category: 'domain', patterns: [/\bmicroservices?\b/i] },
  { name: 'Leadership', slug: 'leadership', category: 'soft_skill', patterns: [/\bleadership\b/i] },
  { name: 'Communication', slug: 'communication', category: 'soft_skill', patterns: [/\bcommunication\b/i] },
  { name: 'Project Management', slug: 'project-management', category: 'soft_skill', patterns: [/\bproject management\b/i] },
];

/**
 * Canonical tag categories allowed by the `tags.tag_category` CHECK constraint
 * (db/migrations/20260719090000_semantic_facets_tags.sql). Keep in sync.
 */
export const TAG_CATEGORIES = [
  'programming_language',
  'framework',
  'cloud',
  'ai',
  'infrastructure',
  'database',
  'soft_skill',
  'domain',
  'tool',
  'other',
];

/**
 * Resolve a tag_category for a free-form skill/technology name.
 *
 * The rules engine only emits categories from TAG_LEXICON, but the LLM
 * extraction path produces arbitrary strings. Normalize those into the same
 * taxonomy and fall back to `other` so writes always satisfy the DB CHECK.
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function resolveTagCategory(name) {
  const value = String(name ?? '').trim();
  if (!value) return 'other';
  const match = TAG_LEXICON.find((entry) => entry.patterns.some((pattern) => pattern.test(value)));
  return match ? match.category : 'other';
}

/** Map legacy L-levels / titles → experience_level facet values */
export const LEGACY_LEVEL_TO_EXPERIENCE = {
  L1: 'intern',
  L2: 'entry',
  L3: 'entry',
  L4: 'mid',
  L5: 'senior',
  L6: 'staff',
  L7: 'principal',
  L8: 'director',
  L9: 'director',
};

/**
 * Body text is noisy ("we use AI", "ensure compliance", "revenue growth"), so
 * `job_family` is title-first. When the title says nothing, only these
 * high-precision technical areas may be inferred from the body.
 */
export const BODY_SAFE_FAMILY_AREAS = new Set([
  'machine_learning',
  'backend',
  'frontend',
  'full_stack',
  'devops',
  'security',
  'data',
  'design',
]);

/**
 * Primary career area used to keep legacy jobs.job_family roughly populated.
 */
export const CAREER_AREA_TO_LEGACY_FAMILY = {
  machine_learning: 'machine_learning_engineer',
  ai: 'ai_engineer',
  data: 'data_engineer',
  backend: 'software_engineer',
  frontend: 'software_engineer',
  full_stack: 'software_engineer',
  devops: 'devops_engineer',
  cloud: 'devops_engineer',
  security: 'security_engineer',
  product: 'product_manager',
  design: 'product_designer',
  sales: 'account_executive',
  marketing: 'marketing',
  finance: 'financial_analyst',
  legal: 'corporate_legal_associate',
  hr: 'recruiter',
  administration: null,
  operations: null,
  it: null,
  management: 'engineering_manager',
  quantitative: 'quantitative_researcher',
  hardware: 'hardware_engineer',
};
