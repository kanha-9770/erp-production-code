import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

// Helper: Extract field references like {Field Label} or {Field Id}
function extractFieldReferences(expression: string): string[] {
  const regex = /\{([^}]+)\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(expression)) !== null) {
    matches.push(match[1].trim());
  }
  return [...new Set(matches)];
}

export async function GET(request: NextRequest) {
  try {
    const formulaFields = await prisma.formulaField.findMany({
      include: {
        formField: {
          include: {
            // For fields directly in FormSection
            section: {
              include: {
                form: { select: { id: true } },   // we only need formId
              },
            },
            // For fields inside Subform (top-level or nested)
            subform: {
              include: {
                form: { select: { id: true } },   // Subform has direct form relation
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enhancedData = await Promise.all(
      formulaFields.map(async (formula) => {
        const expression = formula.expression;
        const references = extractFieldReferences(expression);

        // Get root formId - works for both section fields and subform fields
        const formField = formula.formField;
        const formId =
          formField.section?.form?.id || formField.subform?.form?.id;

        if (!formId) {
          return { ...formula, dependencies: [] };
        }

        // Fetch all fields in the same form (including inside any subforms)
        const allFieldsInForm = await prisma.formField.findMany({
          where: {
            OR: [
              { section: { formId } },           // fields in main form sections
              { subform: { formId } },           // fields inside any subform of this form
            ],
          },
          select: {
            id: true,
            label: true,
            type: true,
            decimalPlaces: true,
          },
        });

        // Match references
        const dependencies = references
          .map((ref) => {
            const matchedField = allFieldsInForm.find(
              (f) => f.label === ref || f.id === ref
            );
            if (!matchedField) return null;

            const typeMap: Record<string, string> = {
              number: 'Number',
              currency: 'Currency',
              date: 'DateTime',
              datetime: 'DateTime',
              text: 'Text',
              textarea: 'Text',
              checkbox: 'Boolean',
              picklist: 'Picklist',
              multipicklist: 'Picklist',
              // add more if needed
            };

            return {
              reference: ref,
              fieldId: matchedField.id,
              label: matchedField.label,
              type: typeMap[matchedField.type] || 'Text',
              decimalPlaces: matchedField.decimalPlaces ?? 2,
            };
          })
          .filter(Boolean);

        return {
          ...formula,
          dependencies,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    console.error('Error fetching formula fields:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch formula fields',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}