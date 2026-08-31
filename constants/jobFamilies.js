// Job Families organized by categories
// Based on Amazon/Levels.fyi structure for comprehensive white-collar jobs

export const JOB_FAMILY_GROUPS = [
  {
    label: "Technology",
    options: [
      { value: "software_engineer", label: "Software Engineer" },
      { value: "data_engineer", label: "Data Engineer" },
      { value: "devops_engineer", label: "DevOps Engineer" },
      { value: "site_reliability_engineer", label: "Site Reliability Engineer" },
      { value: "security_engineer", label: "Security Engineer" },
      { value: "cybersecurity_analyst", label: "Cybersecurity Analyst" },
      { value: "technical_writer", label: "Technical Writer" },
    ]
  },
  {
    label: "AI & Research",
    options: [
      { value: "machine_learning_engineer", label: "Machine Learning Engineer" },
      { value: "applied_scientist", label: "Applied Scientist" },
      { value: "research_scientist", label: "Research Scientist" },
      { value: "ai_engineer", label: "AI Engineer" },
      { value: "ai_ml_researcher", label: "AI/ML Researcher" },
    ]
  },
  {
    label: "Product & Design",
    options: [
      { value: "product_manager", label: "Product Manager" },
      { value: "product_designer", label: "Product Designer" },
      { value: "ux_researcher", label: "UX Researcher" },
      { value: "product_design_manager", label: "Product Design Manager" },
      { value: "graphic_designer", label: "Graphic Designer" },
    ]
  },
  {
    label: "Data & Analytics",
    options: [
      { value: "data_scientist", label: "Data Scientist" },
      { value: "data_analyst", label: "Data Analyst" },
      { value: "business_analyst", label: "Business Analyst" },
    ]
  },
  {
    label: "Business & Consulting",
    options: [
      { value: "management_consultant", label: "Management Consultant" },
      { value: "business_development", label: "Business Development" },
      { value: "corporate_development", label: "Corporate Development" },
      { value: "partner_manager", label: "Partner Manager" },
      { value: "business_operations", label: "Business Operations" },
      { value: "business_operations_manager", label: "Business Operations Manager" },
    ]
  },
  {
    label: "Sales & GTM",
    options: [
      { value: "account_executive", label: "Account Executive" },
      { value: "sales_engineer", label: "Sales Engineer" },
      { value: "technical_account_manager", label: "Technical Account Manager" },
      { value: "customer_success", label: "Customer Success" },
      { value: "revenue_operations", label: "Revenue Operations" },
    ]
  },
  {
    label: "Finance",
    options: [
      { value: "investment_banker", label: "Investment Banker" },
      { value: "financial_analyst", label: "Financial Analyst" },
    ]
  },
  {
    label: "Quantitative Trading",
    options: [
      { value: "quantitative_researcher", label: "Quantitative Researcher" },
      { value: "quantitative_trader", label: "Quantitative Trader" },
      { value: "quantitative_developer", label: "Quantitative Developer" },
      { value: "algorithmic_trader", label: "Algorithmic Trader" },
    ]
  },
  {
    label: "Legal & Compliance",
    options: [
      { value: "big_law_associate", label: "Big Law Associate" },
      { value: "corporate_legal_associate", label: "Corporate Legal Associate" },
      { value: "compliance_officer", label: "Compliance Officer" },
      { value: "legal_operations", label: "Legal Operations" },
      { value: "contracts_manager", label: "Contracts Manager" },
    ]
  },
  {
    label: "Strategy & Operations",
    options: [
      { value: "strategy_analyst", label: "Strategy Analyst" },
      { value: "operations_manager", label: "Operations Manager" },
      { value: "chief_of_staff", label: "Chief of Staff" },
    ]
  },
  {
    label: "Marketing",
    options: [
      { value: "marketing", label: "Marketing" },
      { value: "marketing_operations", label: "Marketing Operations" },
      { value: "growth_marketing", label: "Growth Marketing" },
      { value: "product_marketing", label: "Product Marketing" },
    ]
  },
  {
    label: "People & Talent",
    options: [
      { value: "recruiter", label: "Recruiter" },
      { value: "people_operations", label: "People Operations" },
      { value: "talent_acquisition", label: "Talent Acquisition" },
      { value: "hr_business_partner", label: "HR Business Partner" },
    ]
  },
  {
    label: "Hardware Engineering",
    options: [
      { value: "hardware_engineer", label: "Hardware Engineer" },
      { value: "biomedical_engineer", label: "Biomedical Engineer" },
      { value: "electrical_engineer", label: "Electrical Engineer" },
      { value: "mechanical_engineer", label: "Mechanical Engineer" },
    ]
  },
  {
    label: "Engineering Management",
    options: [
      { value: "software_engineering_manager", label: "Software Engineering Manager" },
      { value: "engineering_manager", label: "Engineering Manager" },
      { value: "technical_program_manager", label: "Technical Program Manager" },
    ]
  },
  {
    label: "Other",
    options: [
      { value: "other", label: "Other" },
    ]
  }
];

// Flattened list for easy lookup (useful for filtering, etc.)
export const ALL_JOB_FAMILIES = JOB_FAMILY_GROUPS.flatMap(group => group.options);

// Helper function to get job family by value
export const getJobFamilyByValue = (value) => {
  return ALL_JOB_FAMILIES.find(job => job.value === value);
};

// Helper function to get category for a job family
export const getCategoryForJobFamily = (value) => {
  for (const group of JOB_FAMILY_GROUPS) {
    const found = group.options.find(opt => opt.value === value);
    if (found) return group.label;
  }
  return null;
};
