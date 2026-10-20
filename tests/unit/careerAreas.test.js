import { describe, it, expect } from 'vitest';
import { extract } from '../../scripts/ingestion/extraction/extractors/careerAreas.js';
import { classifyJob } from '../../scripts/ingestion/classification/classify.js';

const run = (title, description = '') => extract({ title, description });

describe('career area extraction', () => {
  it('classifies a generic software engineer from the title', () => {
    const { jobFamily, careerAreas } = run(
      'Software Engineer, Payments',
      'Build APIs in Python and Postgres.',
    );
    expect(jobFamily.value).toBe('software_engineer');
    expect(careerAreas.value[0]).toBe('backend');
  });

  it('does not let a body-only "AI" mention decide job_family', () => {
    const { jobFamily, careerAreas } = run(
      'Engagement Letter Lawyer',
      'We use AI and generative AI to accelerate legal drafting.',
    );
    expect(jobFamily.value).toBe('corporate_legal_associate');
    expect(careerAreas.value).toContain('legal');
    expect(careerAreas.value[0]).toBe('legal');
  });

  it('keeps AI engineering titles as ai_engineer', () => {
    const { jobFamily } = run('AI Engineer', 'Build internal tooling with Python.');
    expect(jobFamily.value).toBe('ai_engineer');
  });

  it('prefers a concrete title role over an "AI" token in the title', () => {
    const { jobFamily } = run(
      'Account Executive, AI Products',
      'Sell our artificial intelligence platform to enterprises.',
    );
    expect(jobFamily.value).toBe('account_executive');
  });

  it('leaves job_family null when the only signal is a weak body AI mention', () => {
    const { jobFamily } = run('Member of Technical Staff', 'We are an AI-first company.');
    expect(jobFamily.value).toBeNull();
  });

  it('does not assign a family from a generic body word like "compliance"', () => {
    const { jobFamily, careerAreas } = run(
      'Launch Engineer',
      'Ensure compliance with export control regulations and ITAR.',
    );
    expect(careerAreas.value).toContain('legal');
    expect(jobFamily.value).toBeNull();
  });

  it('uses high-precision technical body signals when the title is generic', () => {
    const { jobFamily } = run('Member of Technical Staff', 'Run Kubernetes and CI/CD pipelines.');
    expect(jobFamily.value).toBe('devops_engineer');
  });

  it('never assigns a family from noisy body-only signals', () => {
    const { jobFamily, careerAreas } = run(
      'Member of Technical Staff',
      'We are an AI-first company focused on revenue growth and compliance.',
    );
    expect(careerAreas.value.length).toBeGreaterThan(0);
    expect(jobFamily.value).toBeNull();
  });

  it('covers common title variants added for precision', () => {
    expect(run('ASIC Verification Engineer', 'Design chips.').jobFamily.value).toBe(
      'hardware_engineer',
    );
    expect(run('Senior Director, Product Management-GRCx', '').jobFamily.value).toBe(
      'product_manager',
    );
    expect(run('Talent Sourcing Partner', '').jobFamily.value).toBe('recruiter');
    expect(run('Treasury Analyst', '').jobFamily.value).toBe('financial_analyst');
    expect(run('Brand Designer', '').jobFamily.value).toBe('product_designer');
    expect(run('Account Director - Tokyo', '').jobFamily.value).toBe('account_executive');
  });

  it('maps solutions engineers to sales', () => {
    const { jobFamily } = run(
      'Solutions Engineer',
      'Partner with customers on API integrations and pre-sales demos.',
    );
    expect(jobFamily.value).toBe('account_executive');
  });

  it('keeps data and management families intact', () => {
    expect(run('Senior Data Engineer', 'Build pipelines.').jobFamily.value).toBe('data_engineer');
    expect(run('Engineering Manager', 'Lead a team.').jobFamily.value).toBe('engineering_manager');
  });

  it('keeps the legacy classifier in sync with the extractor', () => {
    const classified = classifyJob({
      title: 'Account Executive, AI Products',
      description: 'Sell our artificial intelligence platform.',
    });
    expect(classified.legacy.job_family).toBe('account_executive');

    const engine = classifyJob({
      title: 'Software Engineer',
      description: 'We are an AI-first company building developer tools.',
    });
    expect(engine.legacy.job_family).toBe('software_engineer');
  });
});
