/**
 * Persist Facets + Tags for a job row. Idempotent replace of classifier/employer/ai links.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 * @param {ReturnType<import('./classify.js').classifyJob>} classification
 */
export async function persistJobClassification(supabase, jobId, classification) {
  const facetRefs = dedupeById(
    await ensureFacets(supabase, flattenFacets(classification.facets)),
  );
  const tagRefs = dedupeByIdAndSource(
    await ensureTags(supabase, [
      ...classification.tags.employer,
      ...classification.tags.ai,
    ]),
  );

  // Replace classifier-managed facet links; keep provider/manual if any
  await supabase.from('job_facets').delete().eq('job_id', jobId).eq('source', 'classifier');

  if (facetRefs.length) {
    // Insert after delete — avoid upsert duplicate-target errors within one statement
    const { error } = await supabase.from('job_facets').insert(
      facetRefs.map((f) => ({
        job_id: jobId,
        facet_id: f.id,
        source: 'classifier',
        confidence: f.confidence,
      })),
    );
    if (error) throw new Error(`job_facets insert failed: ${error.message}`);
  }

  // Replace employer + ai tags for this job (community reserved for future)
  await supabase.from('job_tags').delete().eq('job_id', jobId).in('tag_source', ['employer', 'ai']);

  if (tagRefs.length) {
    const { error } = await supabase.from('job_tags').insert(
      tagRefs.map((t) => ({
        job_id: jobId,
        tag_id: t.id,
        tag_source: t.tag_source,
        confidence_score: t.confidence_score,
      })),
    );
    if (error) throw new Error(`job_tags insert failed: ${error.message}`);
  }
}

function flattenFacets(facets) {
  const flattened = Object.entries(facets).flatMap(([type, values]) =>
    (values || []).map((v) =>
      typeof v === 'string'
        ? { facet_type: type, facet_value: v, label: v, confidence: 0.8 }
        : { ...v, facet_type: v.facet_type || type },
    ),
  );

  // One row per (type, value) — keep highest confidence
  const byKey = new Map();
  for (const facet of flattened) {
    const key = `${facet.facet_type}:${facet.facet_value}`;
    const prev = byKey.get(key);
    if (!prev || (facet.confidence ?? 0) > (prev.confidence ?? 0)) {
      byKey.set(key, facet);
    }
  }
  return [...byKey.values()];
}

function dedupeById(refs) {
  const byId = new Map();
  for (const ref of refs) {
    const prev = byId.get(ref.id);
    if (!prev || (ref.confidence ?? 0) > (prev.confidence ?? 0)) {
      byId.set(ref.id, ref);
    }
  }
  return [...byId.values()];
}

function dedupeByIdAndSource(refs) {
  const byKey = new Map();
  for (const ref of refs) {
    const key = `${ref.id}:${ref.tag_source}`;
    const prev = byKey.get(key);
    if (!prev || (ref.confidence_score ?? 0) > (prev.confidence_score ?? 0)) {
      byKey.set(key, ref);
    }
  }
  return [...byKey.values()];
}

async function ensureFacets(supabase, facetList) {
  const resolved = [];

  for (const facet of facetList) {
    const { data: existing, error: selectError } = await supabase
      .from('facets')
      .select('id')
      .eq('facet_type', facet.facet_type)
      .eq('facet_value', facet.facet_value)
      .maybeSingle();

    if (selectError) throw new Error(`facets select failed: ${selectError.message}`);

    if (existing) {
      resolved.push({ id: existing.id, confidence: facet.confidence ?? 1 });
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('facets')
      .insert({
        facet_type: facet.facet_type,
        facet_value: facet.facet_value,
        label: facet.label || facet.facet_value,
      })
      .select('id')
      .single();

    if (insertError) {
      // Race: another worker inserted — re-select
      const { data: again } = await supabase
        .from('facets')
        .select('id')
        .eq('facet_type', facet.facet_type)
        .eq('facet_value', facet.facet_value)
        .maybeSingle();
      if (!again) throw new Error(`facets insert failed: ${insertError.message}`);
      resolved.push({ id: again.id, confidence: facet.confidence ?? 1 });
    } else {
      resolved.push({ id: inserted.id, confidence: facet.confidence ?? 1 });
    }
  }

  return resolved;
}

async function ensureTags(supabase, tagList) {
  const resolved = [];

  for (const tag of tagList) {
    const { data: existing, error: selectError } = await supabase
      .from('tags')
      .select('id')
      .eq('tag_slug', tag.tag_slug)
      .maybeSingle();

    if (selectError) throw new Error(`tags select failed: ${selectError.message}`);

    let tagId = existing?.id;
    if (!tagId) {
      const { data: inserted, error: insertError } = await supabase
        .from('tags')
        .insert({
          tag_name: tag.tag_name,
          tag_slug: tag.tag_slug,
          tag_category: tag.tag_category || 'other',
        })
        .select('id')
        .single();

      if (insertError) {
        const { data: again } = await supabase
          .from('tags')
          .select('id')
          .eq('tag_slug', tag.tag_slug)
          .maybeSingle();
        if (!again) throw new Error(`tags insert failed: ${insertError.message}`);
        tagId = again.id;
      } else {
        tagId = inserted.id;
      }
    }

    resolved.push({
      id: tagId,
      tag_source: tag.tag_source,
      confidence_score: tag.confidence_score ?? 1,
    });
  }

  return resolved;
}
