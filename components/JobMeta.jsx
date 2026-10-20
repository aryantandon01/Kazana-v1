/**
 * @deprecated The metadata row is now the shared `Meta` component
 * (components/Meta.jsx) since interview reports use it too. This barrel keeps
 * older `JobMeta` imports — and `buildJobMetaItems` — working unchanged.
 */
export { default, default as JobMeta, buildJobMetaItems } from '@/components/Meta';

