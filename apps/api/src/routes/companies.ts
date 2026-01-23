import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';

const router = Router();

const createCompanySchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
});

const updateCompanySchema = createCompanySchema.partial();

// GET /api/companies - Get all companies
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Company')
      .select(`
        *,
        deals:Deal(*)
      `)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id - Get single company
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('Company')
      .select(`
        *,
        deals:Deal(
          *,
          documents:Document(*),
          activities:Activity(*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Company not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies - Create new company
router.post('/', async (req, res) => {
  try {
    const data = createCompanySchema.parse(req.body);

    const { data: company, error } = await supabase
      .from('Company')
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// PATCH /api/companies/:id - Update company
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = updateCompanySchema.parse(req.body);

    const { data: company, error } = await supabase
      .from('Company')
      .update(data)
      .eq('id', id)
      .select(`
        *,
        deals:Deal(*)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Company not found' });
      }
      throw error;
    }

    res.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// DELETE /api/companies/:id - Delete company
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Company')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
