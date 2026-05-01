import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const SAMPLE_EMPLOYEES = [
  { id: 'EMP001', firstName: 'Aarav',  lastName: 'Sharma',  email: 'aarav.sharma@nessco.in',  salary: 85000, designation: 'Senior Engineer', department: 'Engineering' },
  { id: 'EMP002', firstName: 'Priya',  lastName: 'Patel',   email: 'priya.patel@nessco.in',   salary: 95000, designation: 'Product Manager', department: 'Product' },
  { id: 'EMP003', firstName: 'Rohan',  lastName: 'Verma',   email: 'rohan.verma@nessco.in',   salary: 65000, designation: 'UI Designer',     department: 'Design' },
  { id: 'EMP004', firstName: 'Anjali', lastName: 'Singh',   email: 'anjali.singh@nessco.in',  salary: 55000, designation: 'HR Executive',    department: 'Human Resources' },
  { id: 'EMP005', firstName: 'Vikram', lastName: 'Iyer',    email: 'vikram.iyer@nessco.in',   salary: 70000, designation: 'Data Analyst',    department: 'Analytics' },
];

interface FieldRef {
  id: string;
  label: string;
  type: string;
  sectionId: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function findField(fields: FieldRef[], candidates: string[]): FieldRef | null {
  for (const cand of candidates) {
    const target = norm(cand);
    const exact = fields.find((f) => norm(f.label) === target);
    if (exact) return exact;
  }
  for (const cand of candidates) {
    const target = norm(cand);
    const partial = fields.find((f) => norm(f.label).includes(target));
    if (partial) return partial;
  }
  return null;
}

async function loadFormFields(name: string): Promise<{ form: any; fields: FieldRef[] } | null> {
  const form = await prisma.form.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    include: {
      sections: { include: { fields: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
      tableMapping: true,
    },
  });
  if (!form) return null;
  const fields: FieldRef[] = [];
  for (const sec of form.sections) {
    for (const f of sec.fields) {
      fields.push({ id: f.id, label: f.label ?? '', type: f.type, sectionId: sec.id });
    }
  }
  return { form, fields };
}

function buildRecordData(
  formId: string,
  formName: string,
  selections: Array<{ field: FieldRef; value: any }>,
): any {
  const sections: Record<string, any> = {};
  for (const { field, value } of selections) {
    if (!sections[field.sectionId]) {
      sections[field.sectionId] = { fields: {} };
    }
    sections[field.sectionId].fields[field.id] = {
      value,
      type: field.type,
      label: field.label,
    };
  }
  return {
    formId,
    formName,
    metadata: { seededAt: new Date().toISOString(), source: 'seed-payroll-data' },
    sections,
    subforms: {},
  };
}

async function insertRecord(form: any, recordData: any, ctx: { date?: Date; employeeId?: string }) {
  const tableName: string | undefined = form.tableMapping?.storageTable;
  const num = tableName?.match(/\d+$/)?.[0];
  const id = randomUUID();
  const submittedAt = new Date();

  const baseParams: any = {
    id,
    formId: form.id,
    recordData,
    submittedBy: 'seed-script',
    employee_id: ctx.employeeId ?? null,
    date: ctx.date ?? null,
    submittedAt,
    status: 'submitted',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (tableName === 'form_records_14') {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) throw new Error('No organization exists — create one before seeding employees');
    baseParams.organizationId = org.id;
  }

  if (num) {
    const key = `formRecord${num}` as keyof typeof prisma;
    await (prisma[key] as any).create({ data: baseParams });
  }

  try {
    await prisma.formRecord.create({
      data: {
        id,
        formId: form.id,
        recordData,
        organizationId: baseParams.organizationId ?? null,
        employee_id: baseParams.employee_id,
        date: baseParams.date,
        submittedBy: baseParams.submittedBy,
        submittedAt,
        status: 'submitted',
      },
    });
  } catch {
    // unified table may already have this id from sharded create — ignore
  }
}

function timeToDate(date: Date, hh: number, mm: number): Date {
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function workingDaysOfMonth(year: number, monthIdx: number): Date[] {
  const out: Date[] = [];
  const last = new Date(year, monthIdx + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, monthIdx, day);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d);
  }
  return out;
}

async function seed() {
  const targetMonth = process.env.PAYROLL_SEED_MONTH || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = targetMonth.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;

  console.log('\n────────────────────────────────────────────');
  console.log(' Payroll seed data — workflow simulation');
  console.log('────────────────────────────────────────────');
  console.log(` Month:     ${targetMonth}`);
  console.log(` Employees: ${SAMPLE_EMPLOYEES.length}`);
  console.log('────────────────────────────────────────────\n');

  // STAGE 1: Onboarding — create Employee records
  console.log('[1/3] Onboarding: Employee Master form...');
  const empBundle =
    (await loadFormFields('Employee Master')) ||
    (await loadFormFields('Employee Profile')) ||
    (await loadFormFields('Employees'));

  if (!empBundle) {
    console.error('  ✗ No Employee Master/Profile/Employees form found — skipping employee seeding');
  } else {
    const { form, fields } = empBundle;
    const fEmail = findField(fields, ['Company Email', 'Email', 'Employee Email']);
    const fSalary = findField(fields, ['Salary Amount', 'Salary', 'Total Salary', 'CTC', 'Monthly Salary']);
    const fEmpId = findField(fields, ['Employee ID', 'Emp ID', 'Employee Number']);
    const fFirst = findField(fields, ['First Name', 'Given Name']);
    const fLast = findField(fields, ['Last Name', 'Surname', 'Family Name']);
    const fDesignation = findField(fields, ['Designation', 'Job Title', 'Role', 'Position']);
    const fDepartment = findField(fields, ['Department', 'Dept', 'Team']);

    console.log(`  Form: ${form.name} (${form.id})`);
    console.log(`  Mapped: salary=${fSalary?.label ?? 'n/a'}, email=${fEmail?.label ?? 'n/a'}, empId=${fEmpId?.label ?? 'n/a'}`);

    if (!fSalary) {
      console.error('  ✗ Could not find a Salary field — make sure the form has a "Salary Amount" or "Salary" field');
    } else {
      let inserted = 0;
      for (const e of SAMPLE_EMPLOYEES) {
        const sels: any[] = [{ field: fSalary, value: e.salary }];
        if (fEmail) sels.push({ field: fEmail, value: e.email });
        if (fEmpId) sels.push({ field: fEmpId, value: e.id });
        if (fFirst) sels.push({ field: fFirst, value: e.firstName });
        if (fLast) sels.push({ field: fLast, value: e.lastName });
        if (fDesignation) sels.push({ field: fDesignation, value: e.designation });
        if (fDepartment) sels.push({ field: fDepartment, value: e.department });
        const data = buildRecordData(form.id, form.name, sels);
        await insertRecord(form, data, { employeeId: e.id });
        inserted++;
      }
      console.log(`  ✓ Inserted ${inserted} employee records`);
    }
  }

  // STAGE 2: Day-to-day operations — Check-In records
  console.log('\n[2/3] Operations: Check-In records...');
  const ciBundle =
    (await loadFormFields('CHECKIN')) ||
    (await loadFormFields('Check-In')) ||
    (await loadFormFields('Check In'));

  const days = workingDaysOfMonth(year, monthIdx);

  if (!ciBundle) {
    console.error('  ✗ No CHECKIN form found — skipping');
  } else {
    const { form, fields } = ciBundle;
    const fDate = findField(fields, ['In Date', 'Date', 'Attendance Date']);
    const fTime = findField(fields, ['In Time', 'Check-In Time', 'CheckIn Time', 'Time In']);
    const fEmail = findField(fields, ['Email', 'Company Email', 'Employee Email']);
    const fEmpId = findField(fields, ['Employee ID', 'Emp ID']);

    console.log(`  Form: ${form.name} (${form.id})`);
    console.log(`  Mapped: date=${fDate?.label ?? 'n/a'}, time=${fTime?.label ?? 'n/a'}`);

    if (!fDate || !fTime) {
      console.error('  ✗ Need Date + Time fields on CHECKIN form');
    } else {
      let inserted = 0;
      for (const e of SAMPLE_EMPLOYEES) {
        for (const day of days) {
          const skipNoise = (e.id.charCodeAt(e.id.length - 1) * day.getDate()) % 23;
          if (skipNoise < 2) continue;
          const checkIn = timeToDate(day, 9, (e.id.charCodeAt(e.id.length - 1) + day.getDate()) % 30);
          const sels: any[] = [
            { field: fDate, value: day.toISOString().slice(0, 10) },
            { field: fTime, value: `${String(checkIn.getHours()).padStart(2, '0')}:${String(checkIn.getMinutes()).padStart(2, '0')}` },
          ];
          if (fEmail) sels.push({ field: fEmail, value: e.email });
          if (fEmpId) sels.push({ field: fEmpId, value: e.id });
          const data = buildRecordData(form.id, form.name, sels);
          await insertRecord(form, data, { date: day, employeeId: e.id });
          inserted++;
        }
      }
      console.log(`  ✓ Inserted ${inserted} check-in records`);
    }
  }

  // STAGE 3: Day-to-day operations — Check-Out records
  console.log('\n[3/3] Operations: Check-Out records...');
  const coBundle =
    (await loadFormFields('CHECKOUT')) ||
    (await loadFormFields('Check-Out')) ||
    (await loadFormFields('Check Out'));

  if (!coBundle) {
    console.error('  ✗ No CHECKOUT form found — skipping (working hours will default to 8h)');
  } else {
    const { form, fields } = coBundle;
    const fDate = findField(fields, ['Out Date', 'Date', 'Attendance Date']);
    const fTime = findField(fields, ['Out Time', 'Check-Out Time', 'CheckOut Time', 'Time Out']);
    const fEmail = findField(fields, ['Email', 'Company Email', 'Employee Email']);
    const fEmpId = findField(fields, ['Employee ID', 'Emp ID']);

    console.log(`  Form: ${form.name} (${form.id})`);
    console.log(`  Mapped: date=${fDate?.label ?? 'n/a'}, time=${fTime?.label ?? 'n/a'}`);

    if (!fDate || !fTime) {
      console.error('  ✗ Need Date + Time fields on CHECKOUT form');
    } else {
      let inserted = 0;
      for (const e of SAMPLE_EMPLOYEES) {
        for (const day of days) {
          const skipNoise = (e.id.charCodeAt(e.id.length - 1) * day.getDate()) % 23;
          if (skipNoise < 2) continue;
          const checkOut = timeToDate(day, 18, (e.id.charCodeAt(e.id.length - 1) * 3 + day.getDate()) % 45);
          const sels: any[] = [
            { field: fDate, value: day.toISOString().slice(0, 10) },
            { field: fTime, value: `${String(checkOut.getHours()).padStart(2, '0')}:${String(checkOut.getMinutes()).padStart(2, '0')}` },
          ];
          if (fEmail) sels.push({ field: fEmail, value: e.email });
          if (fEmpId) sels.push({ field: fEmpId, value: e.id });
          const data = buildRecordData(form.id, form.name, sels);
          await insertRecord(form, data, { date: day, employeeId: e.id });
          inserted++;
        }
      }
      console.log(`  ✓ Inserted ${inserted} check-out records`);
    }
  }

  console.log('\n────────────────────────────────────────────');
  console.log(' Done. Now visit http://localhost:5001/payroll');
  console.log(' and click "Auto-Generate Payroll".');
  console.log('────────────────────────────────────────────\n');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
