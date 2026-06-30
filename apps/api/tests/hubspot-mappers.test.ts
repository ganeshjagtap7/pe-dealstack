import { describe, it, expect } from 'vitest';
import { mapCompany, mapContact, mapDeal } from '../src/services/hubspot/mappers.js';

describe('mapCompany', () => {
  it('maps standard properties and stashes the rest', () => {
    const out = mapCompany({
      id: '101',
      properties: {
        name: 'Acme Corp', industry: 'Manufacturing',
        domain: 'acme.com', description: 'Widgets',
        custom_field_x: 'keep-me',
      },
    });
    expect(out).toEqual({
      hubspotId: '101',
      name: 'Acme Corp',
      industry: 'Manufacturing',
      website: 'acme.com',
      description: 'Widgets',
      hubspotProperties: { custom_field_x: 'keep-me' },
    });
  });

  it('falls back to "Unknown Company" when name missing', () => {
    expect(mapCompany({ id: '1', properties: {} }).name).toBe('Unknown Company');
  });

  it('preserves a client custom property verbatim in hubspotProperties', () => {
    const out = mapCompany({ id: '1', properties: { name: 'Acme', fund_vintage: '2021', sector_focus: 'SaaS' } });
    expect(out.hubspotProperties).toEqual({ fund_vintage: '2021', sector_focus: 'SaaS' });
    expect(out.name).toBe('Acme');
  });
});

describe('mapContact', () => {
  it('maps name/email/title and associated company', () => {
    const out = mapContact(
      { id: '5', properties: { firstname: 'Jane', lastname: 'Doe', email: 'j@x.com', jobtitle: 'CFO', phone: '123' } },
      'Acme Corp',
    );
    expect(out).toMatchObject({
      hubspotId: '5', firstName: 'Jane', lastName: 'Doe',
      email: 'j@x.com', title: 'CFO', phone: '123', company: 'Acme Corp',
    });
  });

  it('defaults blank names to empty string, not null', () => {
    const out = mapContact({ id: '6', properties: {} }, null);
    expect(out.firstName).toBe('');
    expect(out.lastName).toBe('');
    expect(out.company).toBeNull();
  });
});

describe('mapDeal', () => {
  it('maps amount to dealSize and tags source as hubspot', () => {
    const out = mapDeal({
      id: '9',
      properties: { dealname: 'Big Deal', amount: '50000', dealstage: 'qualified', pipeline: 'default' },
      associations: { companies: { results: [{ id: '101' }] } },
    });
    expect(out.name).toBe('Big Deal');
    expect(out.dealSize).toBe(50000);
    expect(out.associatedCompanyHubspotId).toBe('101');
    expect(out.customFields).toMatchObject({ source: 'hubspot', dealstage: 'qualified', pipeline: 'default' });
  });

  it('handles missing amount as null dealSize', () => {
    expect(mapDeal({ id: '9', properties: { dealname: 'X' } }).dealSize).toBeNull();
  });
});
