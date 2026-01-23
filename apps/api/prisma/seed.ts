import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create companies
  const apexCompany = await prisma.company.create({
    data: {
      name: 'Apex Logistics',
      industry: 'Supply Chain SaaS',
      description: 'Leading supply chain management platform',
      website: 'https://apexlogistics.example.com',
    },
  });

  const medicareCompany = await prisma.company.create({
    data: {
      name: 'MediCare Plus',
      industry: 'Healthcare Services',
      description: 'Healthcare services provider',
      website: 'https://medicareplus.example.com',
    },
  });

  const nebulaCompany = await prisma.company.create({
    data: {
      name: 'Nebula Systems',
      industry: 'Cloud Infrastructure',
      description: 'Cloud infrastructure solutions',
      website: 'https://nebulasystems.example.com',
    },
  });

  const titanCompany = await prisma.company.create({
    data: {
      name: 'Titan Freight',
      industry: 'Transportation',
      description: 'Freight and transportation services',
      website: 'https://titanfreight.example.com',
    },
  });

  // Create deals
  const apexDeal = await prisma.deal.create({
    data: {
      name: 'Apex Logistics',
      companyId: apexCompany.id,
      stage: 'DUE_DILIGENCE',
      status: 'ACTIVE',
      irrProjected: 24.5,
      mom: 3.5,
      ebitda: 12.4,
      revenue: 48,
      industry: 'Supply Chain SaaS',
      dealSize: 48,
      icon: 'webhook',
      aiThesis:
        'Strong recurring revenue model with high retention. Note: Q3 churn spike detected in document "CIM_v3.pdf" requires deeper dive.',
      lastDocument: 'CIM_2023.pdf',
      lastDocumentUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
  });

  const medicareDeal = await prisma.deal.create({
    data: {
      name: 'MediCare Plus',
      companyId: medicareCompany.id,
      stage: 'INITIAL_REVIEW',
      status: 'ACTIVE',
      irrProjected: 18.2,
      mom: 2.1,
      ebitda: 45.0,
      revenue: 180,
      industry: 'Healthcare Services',
      dealSize: 180,
      icon: 'monitor_heart',
      aiThesis:
        'Regulatory tailwinds present in regional market. Extraction confidence high (98%). Stable cash flow profile identified.',
      lastDocument: 'Teaser_deck.pdf',
      lastDocumentUpdated: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    },
  });

  const nebulaDeal = await prisma.deal.create({
    data: {
      name: 'Nebula Systems',
      companyId: nebulaCompany.id,
      stage: 'IOI_SUBMITTED',
      status: 'ACTIVE',
      irrProjected: 29.1,
      mom: 4.2,
      ebitda: -2.5,
      revenue: 15,
      industry: 'Cloud Infrastructure',
      dealSize: 15,
      icon: 'cloud_queue',
      aiThesis:
        'High growth potential but currently burning cash. Requires operational restructuring post-acquisition to reach profitability.',
      lastDocument: 'Email_thread.msg',
      lastDocumentUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    },
  });

  const titanDeal = await prisma.deal.create({
    data: {
      name: 'Titan Freight',
      companyId: titanCompany.id,
      stage: 'PASSED',
      status: 'PASSED',
      irrProjected: 12,
      mom: 1.5,
      ebitda: 8.0,
      revenue: 62,
      industry: 'Transportation',
      dealSize: 62,
      icon: 'local_shipping',
      aiThesis:
        'Margins compressing due to rising fuel costs. Owner seeking unrealistic multiple based on 2021 peak.',
      lastDocument: 'Financials.xlsx',
      lastDocumentUpdated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
  });

  // Create documents
  await prisma.document.create({
    data: {
      dealId: apexDeal.id,
      name: 'CIM_2023.pdf',
      type: 'CIM',
      fileSize: 5242880,
      mimeType: 'application/pdf',
      confidence: 0.95,
    },
  });

  await prisma.document.create({
    data: {
      dealId: medicareDeal.id,
      name: 'Teaser_deck.pdf',
      type: 'TEASER',
      fileSize: 2097152,
      mimeType: 'application/pdf',
      confidence: 0.98,
    },
  });

  await prisma.document.create({
    data: {
      dealId: nebulaDeal.id,
      name: 'Email_thread.msg',
      type: 'EMAIL',
      fileSize: 102400,
      mimeType: 'application/vnd.ms-outlook',
      confidence: 0.92,
    },
  });

  await prisma.document.create({
    data: {
      dealId: titanDeal.id,
      name: 'Financials.xlsx',
      type: 'FINANCIALS',
      fileSize: 1048576,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      confidence: 0.88,
    },
  });

  // Create activities
  await prisma.activity.create({
    data: {
      dealId: apexDeal.id,
      type: 'DOCUMENT_UPLOADED',
      title: 'CIM Document Uploaded',
      description: 'Confidential Information Memorandum uploaded and processed',
    },
  });

  await prisma.activity.create({
    data: {
      dealId: apexDeal.id,
      type: 'STAGE_CHANGED',
      title: 'Moved to Due Diligence',
      description: 'Deal progressed from Initial Review to Due Diligence stage',
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log(`Created ${await prisma.company.count()} companies`);
  console.log(`Created ${await prisma.deal.count()} deals`);
  console.log(`Created ${await prisma.document.count()} documents`);
  console.log(`Created ${await prisma.activity.count()} activities`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
