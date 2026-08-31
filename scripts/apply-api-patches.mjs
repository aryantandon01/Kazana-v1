#!/usr/bin/env node
/**
 * Patches migrated views to use API routes instead of direct Supabase queries.
 */
import { readFileSync, writeFileSync } from 'fs';

const lookupFn = `  const loadCompanies = async (inputValue) => {
    try {
      const q = inputValue ? \`?q=\${encodeURIComponent(inputValue)}\` : '';
      const { data } = await apiFetch(\`/api/lookups/companies\${q}\`);
      return (data || []).map((c) => ({ value: c.name, label: c.name }));
    } catch { return []; }
  };

  const loadCountries = async (inputValue) => {
    try {
      const q = inputValue ? \`?q=\${encodeURIComponent(inputValue)}\` : '';
      const { data } = await apiFetch(\`/api/lookups/countries\${q}\`);
      return (data || []).map((c) => ({ value: c.name, label: c.name }));
    } catch { return []; }
  };

  const loadUniversities = async (inputValue) => {
    try {
      const q = inputValue ? \`?q=\${encodeURIComponent(inputValue)}\` : '';
      const { data } = await apiFetch(\`/api/lookups/universities\${q}\`);
      return (data || []).map((u) => ({
        value: u.name,
        label: u.country ? \`\${u.name} (\${u.country})\` : u.name,
      }));
    } catch { return []; }
  };`;

function addApiImport(content) {
  if (content.includes("from '@/lib/api/client'")) return content;
  return content.replace(
    /import \{ supabase \} from '@\/lib\/supabase\/client';\n/,
    "import { apiFetch } from '@/lib/api/client';\n"
  );
}

// Discover
let discover = readFileSync('views/Discover.jsx', 'utf8');
discover = addApiImport(discover);
discover = discover.replace(
  /const \{ data, error \} = await supabase[\s\S]*?setResumes\(data \|\| \[\]\);/,
  `const { data } = await apiFetch('/api/resumes');
        setResumes(data || []);`
);
discover = discover.replace(
  /\/\/ Load companies from database[\s\S]*?\/\/ Apply filters, search, and sorting/,
  `${lookupFn}\n\n\n  // Apply filters, search, and sorting`
);
writeFileSync('views/Discover.jsx', discover);

// Jobs
let jobs = readFileSync('views/Jobs.jsx', 'utf8');
jobs = addApiImport(jobs);
jobs = jobs.replace(
  /const \{ data, error: fetchError \} = await supabase[\s\S]*?setJobs\(data \|\| \[\]\);/,
  `const { data } = await apiFetch('/api/jobs');
        setJobs(data || []);`
);
writeFileSync('views/Jobs.jsx', jobs);

// ViewJob
let viewJob = readFileSync('views/ViewJob.jsx', 'utf8');
viewJob = addApiImport(viewJob);
viewJob = viewJob.replace(
  /const \{ data, error: fetchError \} = await supabase[\s\S]*?setJob\(data\);/,
  `const { data } = await apiFetch(\`/api/jobs/\${id}\`);
        setJob(data);`
);
writeFileSync('views/ViewJob.jsx', viewJob);

// ViewResume
let viewResume = readFileSync('views/ViewResume.jsx', 'utf8');
viewResume = addApiImport(viewResume);
viewResume = viewResume.replace(
  /const \{ data, error \} = await supabase[\s\S]*?setFileUrl\(data\?\.file_url \|\| null\);/,
  `const { data } = await apiFetch(\`/api/resumes/\${id}\`);
        setFileUrl(data?.file_url || null);`
);
writeFileSync('views/ViewResume.jsx', viewResume);

// ResumeManager
let rm = readFileSync('views/ResumeManager.jsx', 'utf8');
rm = addApiImport(rm);
rm = rm.replace(
  /const \{ data, error \} = await supabase[\s\S]*?setResumes\(data \|\| \[\]\);/,
  `const { data } = await apiFetch('/api/resumes/mine');
        setResumes(data || []);`
);
rm = rm.replace(
  /\/\/ Delete from database[\s\S]*?if \(error\) \{[\s\S]*?\}/,
  `await apiFetch(\`/api/resumes/\${resumeToDelete}\`, { method: 'DELETE' });`
);
rm = rm.replace(
  /if \(!user\) return <Navigate to="\/login" \/>;/,
  `if (!user) {
    router.replace('/login');
    return <Loading />;
  }`
);
writeFileSync('views/ResumeManager.jsx', rm);

// AddResume + EditResume via migrate-page + manual patches already in script
const addResumeSubmit = `    try {
      const file = form.file;
      const companiesArray = form.companies.map((company) => company.value);

      const { data: uploadData } = await apiFetch('/api/resumes/upload-url', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/pdf' }),
      });

      const uploadResponse = await fetch(uploadData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error('File upload failed');

      await apiFetch('/api/resumes', {
        method: 'POST',
        body: JSON.stringify({
          companies: companiesArray,
          job_family: form.job_family,
          level: form.level,
          years_of_experience: parseInt(form.years_of_experience, 10),
          country: form.country ? form.country.value : null,
          university: form.university ? form.university.value : null,
          name: form.name.trim() || undefined,
          file_url: uploadData.publicUrl,
          file_path: uploadData.path,
        }),
      });`;

let add = readFileSync('views/AddResume.jsx', 'utf8');
add = add.replace(
  /import \{ supabase \} from '@\/lib\/supabase\/client';\nimport \{ useAuth \}/,
  "import { apiFetch } from '@/lib/api/client';\nimport { useAuth }"
);
add = add.replace(
  /\/\/ Load companies from database[\s\S]*?const validateForm = \(\) =>/,
  `${lookupFn}\n\n  const validateForm = () =>`
);
add = add.replace(/try \{[\s\S]*?if \(insertError\) \{[\s\S]*?\}/, addResumeSubmit);
writeFileSync('views/AddResume.jsx', add);

let edit = readFileSync('views/EditResume.jsx', 'utf8');
edit = edit.replace(
  /import \{ supabase \} from '@\/lib\/supabase\/client';\nimport \{ useAuth \}/,
  "import { apiFetch } from '@/lib/api/client';\nimport { useAuth }"
);
edit = edit.replace(
  /\/\/ Load companies from database[\s\S]*?useEffect\(\(\) => \{/,
  `${lookupFn}\n\n  useEffect(() => {`
);
edit = edit.replace(
  /const \{ data, error \} = await supabase[\s\S]*?if \(error\) \{[\s\S]*?\}/,
  `const { data, meta } = await apiFetch(\`/api/resumes/\${id}\`);
        if (!meta?.isOwner) throw new Error('You do not have permission to edit this resume');`
);
edit = edit.replace(
  /if \(file\) \{[\s\S]*?updateData\.file_url = urlData\.publicUrl;\s*\}\s*const \{ error \} = await supabase[\s\S]*?if \(error\) \{[\s\S]*?\}/,
  `if (file) {
        const { data: uploadData } = await apiFetch('/api/resumes/upload-url', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/pdf' }),
        });
        const uploadResponse = await fetch(uploadData.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/pdf' },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error('File upload failed');
        updateData.file_url = uploadData.publicUrl;
      }

      await apiFetch(\`/api/resumes/\${id}\`, { method: 'PATCH', body: JSON.stringify(updateData) });`
);
writeFileSync('views/EditResume.jsx', edit);

console.log('API patches applied');
