#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const files = ['views/AddResume.jsx', 'views/EditResume.jsx'];

function migrate(content) {
  if (!content.startsWith("'use client'")) {
    content = `'use client';\n\n${content}`;
  }

  return content
    .replace(/import \{ useNavigate \} from ['"]react-router-dom['"];?\n/g, "import { useRouter } from 'next/navigation';\n")
    .replace(/import \{ useParams, useNavigate \} from ['"]react-router-dom['"];?\n/g, "import { useParams, useRouter } from 'next/navigation';\n")
    .replace(/from ['"]\.\.\/supabaseClient['"]/g, "from '@/lib/supabase/client'")
    .replace(/from ['"]\.\.\/context\/AuthContext['"]/g, "from '@/context/AuthContext'")
    .replace(/from ['"]\.\.\/components\/([^'"]+)['"]/g, "from '@/components/$1'")
    .replace(/from ['"]\.\.\/constants\/([^'"]+)['"]/g, "from '@/constants/$1'")
    .replace(/const navigate = useNavigate\(\)/g, 'const router = useRouter()')
    .replace(/navigate\(/g, 'router.push(');
}

for (const file of files) {
  writeFileSync(file, migrate(readFileSync(file.replace('views/', '_legacy/vite-src/pages/'), 'utf8')));
}

console.log('Re-migrated', files.join(', '));
