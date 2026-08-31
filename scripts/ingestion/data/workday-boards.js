/**
 * Verified Workday CXS career site configs.
 * @typedef {{ companyName: string, tenant: string, wdServer: string, site: string }} WorkdayBoard
 */

/** @type {WorkdayBoard[]} */
export const workdayBoards = [
  { companyName: 'Nvidia', tenant: 'nvidia', wdServer: 'wd5', site: 'NVIDIAExternalCareerSite' },
  { companyName: 'Salesforce', tenant: 'salesforce', wdServer: 'wd12', site: 'External_Career_Site' },
  { companyName: 'Adobe', tenant: 'adobe', wdServer: 'wd5', site: 'external_experienced' },
  { companyName: 'Workday', tenant: 'workday', wdServer: 'wd5', site: 'Workday' },
  { companyName: 'Accenture', tenant: 'accenture', wdServer: 'wd103', site: 'accenturecareers' },
  { companyName: 'Intel', tenant: 'intel', wdServer: 'wd1', site: 'External' },
  { companyName: 'Capital One', tenant: 'capitalone', wdServer: 'wd12', site: 'Capital_One' },
];
