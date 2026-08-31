#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const dirs = ['views', 'components', 'context'];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith('.jsx') || p.endsWith('.js')) files.push(p);
  }
  return files;
}

const replacements = [
  [/import \{ Link \} from ['"]react-router-dom['"];?/g, "import Link from 'next/link';"],
  [/import \{ Link, useLocation \} from ['"]react-router-dom['"];?/g, "import Link from 'next/link';\nimport { usePathname } from 'next/navigation';"],
  [/import \{ useLocation \} from ['"]react-router-dom['"];?/g, "import { usePathname } from 'next/navigation';"],
  [/import \{ useParams, Link \} from ['"]react-router-dom['"];?/g, "import Link from 'next/link';\nimport { useParams } from 'next/navigation';"],
  [/import \{ useParams, useNavigate \} from ['"]react-router-dom['"];?/g, "import { useParams, useRouter } from 'next/navigation';"],
  [/import \{ useNavigate \} from ['"]react-router-dom['"];?/g, "import { useRouter } from 'next/navigation';"],
  [/import \{ useParams \} from ['"]react-router-dom['"];?/g, "import { useParams } from 'next/navigation';"],
  [/import \{ Link, Navigate \} from ['"]react-router-dom['"];?/g, "import Link from 'next/link';\nimport { useRouter } from 'next/navigation';"],
  [/from ['"]\.\.\/supabaseClient['"]/g, "from '@/lib/supabase/client'"],
  [/from ['"]\.\.\/components\//g, "from '@/components/"],
  [/from ['"]\.\/components\//g, "from '@/components/"],
  [/from ['"]\.\.\/context\//g, "from '@/context/"],
  [/from ['"]\.\.\/constants\//g, "from '@/constants/"],
  [/from ['"]\.\.\/hooks\//g, "from '@/hooks/"],
  [/from ['"]\.\/Button['"]/g, "from '@/components/Button'"],
  [/from ['"]\.\/Card['"]/g, "from '@/components/Card'"],
  [/from ['"]\.\/Input['"]/g, "from '@/components/Input'"],
  [/from ['"]\.\/Alert['"]/g, "from '@/components/Alert'"],
  [/from ['"]\.\/Loading['"]/g, "from '@/components/Loading'"],
  [/from ['"]\.\/Toast['"]/g, "from '@/components/Toast'"],
  [/from ['"]\.\/Tooltip['"]/g, "from '@/components/Tooltip'"],
  [/from ['"]\.\/ConfirmationModal['"]/g, "from '@/components/ConfirmationModal'"],
  [/const navigate = useNavigate\(\)/g, 'const router = useRouter()'],
  [/navigate\(/g, 'router.push('],
  [/const location = useLocation\(\)/g, 'const pathname = usePathname()'],
  [/location\.pathname/g, 'pathname'],
  [/<Link to=/g, '<Link href='],
];

for (const dir of dirs) {
  for (const file of walk(dir)) {
    let content = readFileSync(file, 'utf8');
    if (content.includes("'use client'") || content.includes('"use client"')) {
      // already has directive
    } else if (
      file.includes('views/') ||
      file.includes('context/') ||
      content.includes('useState') ||
      content.includes('useEffect') ||
      content.includes('useRouter') ||
      content.includes('usePathname') ||
      content.includes('onClick') ||
      file.includes('Header') ||
      file.includes('Footer') ||
      file.includes('PDFModal') ||
      file.includes('OnboardingTour') ||
      file.includes('ConfirmationModal') ||
      file.includes('Toast') ||
      file.includes('Tooltip')
    ) {
      content = `'use client';\n\n${content}`;
    }

    for (const [pattern, replacement] of replacements) {
      content = content.replace(pattern, replacement);
    }

    writeFileSync(file, content);
  }
}

console.log('Migration import fixes applied.');
