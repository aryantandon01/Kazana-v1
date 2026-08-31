# Migration Guide: Company → Companies

This guide explains how to migrate from the single `company` field to the `companies` array field.

## Database Migration

1. **Go to your Supabase Dashboard** → SQL Editor

2. **Run the migration SQL** (from `database_migration.sql`):

```sql
-- Step 1: Add new companies column as text array
ALTER TABLE resumes 
ADD COLUMN companies TEXT[];

-- Step 2: Migrate existing company data to companies array
UPDATE resumes 
SET companies = ARRAY[company] 
WHERE company IS NOT NULL AND company != '';

-- Step 3: Verify the migration
SELECT id, company, companies FROM resumes LIMIT 10;

-- Step 4: (Optional) Drop the old company column after verifying
-- Only uncomment this after you've verified everything works!
-- ALTER TABLE resumes DROP COLUMN company;
```

## What Changed

### Frontend Changes
- ✅ `AddResume.jsx` - Now uses multi-select for companies
- ✅ `EditResume.jsx` - Now uses multi-select for companies  
- ✅ `Discover.jsx` - Filters and displays multiple companies
- ✅ `ResumeManager.jsx` - Displays multiple companies

### Database Schema
- **Old**: `company TEXT` (single value)
- **New**: `companies TEXT[]` (array of companies)

### Backward Compatibility
The code handles both old and new data:
- If `companies` array exists → uses it
- If only `company` field exists → converts to array `[company]`
- This ensures existing data continues to work

## Testing Checklist

After running the migration:

1. ✅ Verify existing resumes still display correctly
2. ✅ Test adding a new resume with multiple companies
3. ✅ Test editing an existing resume
4. ✅ Test filtering by companies in Discover page
5. ✅ Verify companies display correctly in tables

## Rollback (if needed)

If you need to rollback:

```sql
-- Remove the new column
ALTER TABLE resumes DROP COLUMN companies;

-- The old company column should still exist
```

## Notes for Vercel Deployment

- No special Vercel configuration needed
- The migration only affects Supabase database
- Deploy the updated code to Vercel as normal
- The app will work with both old and new data formats

