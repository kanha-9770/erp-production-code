// src/hooks/use-formulas.ts
import { useMemo } from "react";
import type { Form, FormField, Subform } from "@/types/form-builder";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser";
import type { FormulaReturnType, BlankPreference } from "@/lib/formula/types";

export interface FormulaConfig {
  fieldLabel: string;
  expression: string;
  returnType: FormulaReturnType;
  decimalPlaces: number;
  blankPreference: BlankPreference;
}

export const useFormulas = (form: Form | null, formData: Record<string, any>) => {
  // Get all formula fields (from sections + all nested subforms)
  const formulaFields = useMemo(() => {
    if (!form) return [];

    const getAllSubformFields = (subforms: Subform[]): FormField[] => {
      let fields: FormField[] = [];
      subforms.forEach((subform) => {
        fields = [...fields, ...subform.fields];
        if (subform.childSubforms?.length) {
          fields = [...fields, ...getAllSubformFields(subform.childSubforms)];
        }
      });
      return fields;
    };

    return [
      ...form.sections.flatMap((s) =>
        s.fields.filter((f) => f.type === "formula" && f.properties?.formulaConfig)
      ),
      ...getAllSubformFields(form.subforms || []).filter(
        (f) => f.type === "formula" && f.properties?.formulaConfig
      ),
    ];
  }, [form]);

  // Create mapping of field label/id → current value
  const fieldLabelToValue = useMemo(() => {
    if (!form) return {};

    const mapping: Record<string, any> = {};

    // Main sections
    form.sections.forEach((section) => {
      section.fields.forEach((field) => {
        mapping[field.label] = formData[field.id];
        mapping[field.id] = formData[field.id];
      });
    });

    // Subforms (recursive)
    const processSubforms = (subforms: Subform[]) => {
      subforms.forEach((subform) => {
        subform.fields.forEach((field) => {
          mapping[field.label] = formData[field.id];
          mapping[field.id] = formData[field.id];
        });
        if (subform.childSubforms?.length) {
          processSubforms(subform.childSubforms);
        }
      });
    };

    if (form.subforms) processSubforms(form.subforms);
    return mapping;
  }, [form, formData]);

  // Calculate all formula values
  const formulaValues = useMemo(() => {
    if (!form || formulaFields.length === 0) return {};

    const evaluator = getFormulaEvaluator();
    const result: Record<string, any> = {};

    formulaFields.forEach((field) => {
      const config = field.properties?.formulaConfig as FormulaConfig | undefined;
      if (!config?.expression) return;

      try {
        const referencedFields = extractFieldReferences(config.expression);
        const variables: Record<string, any> = {};

        referencedFields.forEach((ref) => {
          if (fieldLabelToValue[ref] !== undefined) {
            variables[ref] = fieldLabelToValue[ref];
          }
        });

        const evalResult = evaluator.evaluate(
          config.expression,
          variables,
          config.returnType || "Number",
          config.blankPreference || "Empty"
        );

        let finalValue = evalResult.success
          ? evalResult.value
          : config.blankPreference === "Zero"
          ? 0
          : "";

        // Format Number / Currency
        if (config.returnType === "Number" || config.returnType === "Currency") {
          const num = Number(finalValue);
          if (!isNaN(num)) {
            finalValue = num.toFixed(config.decimalPlaces || 2);
            if (config.returnType === "Currency") finalValue = `$${finalValue}`;
          }
        }

        result[field.id] = finalValue;
      } catch (err) {
        console.warn(`Formula error in field ${field.id}:`, err);
        result[field.id] = "";
      }
    });

    return result;
  }, [form, formulaFields, fieldLabelToValue]);

  return {
    formulaValues,
    formulaFields,
  };
};