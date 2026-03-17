"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser";
import type { FormulaReturnType, BlankPreference } from "@/lib/formula/types";
import type { FormField } from "@/types/form-builder";

interface FormulaConfig {
  expression: string;
  returnType: FormulaReturnType;
  decimalPlaces: number;
  blankPreference: BlankPreference;
}

interface UseCellFormulasProps {
  fields: FormField[];
  initialRowData: Record<string, any>;
  onFormulasUpdated?: (newValues: Record<string, any>) => void;
}

export function useCellFormulas({
  fields,
  initialRowData,
  onFormulasUpdated,
}: UseCellFormulasProps) {
  const [formulaValues, setFormulaValues] = useState<Record<string, any>>({});

  const formulaFields = useMemo(
    () =>
      fields.filter((f) => f.type === "formula" && f.properties?.formulaConfig),
    [fields],
  );

  const evaluatorFields = useMemo(() => {
    return fields.map((f) => {
      if (f.type === "formula" && f.properties?.formulaConfig?.returnType) {
        return {
          ...f,
          type: String(f.properties.formulaConfig.returnType).toLowerCase(),
        } as FormField;
      }
      return f;
    });
  }, [fields]);

  const recalculateFormulas = useCallback(
    (currentData: Record<string, any>) => {
      const evaluator = getFormulaEvaluator();
      const newValues: Record<string, any> = {};
      const runningValues: Record<string, any> = {};

      formulaFields.forEach((field) => {
        const config = field.properties?.formulaConfig as
          | FormulaConfig
          | undefined;
        if (!config?.expression) return;

        try {
          const refs = extractFieldReferences(config.expression);
          const variables: Record<string, any> = {};

          refs.forEach((refId) => {
            variables[refId] =
              currentData[refId] !== undefined &&
              currentData[refId] !== null &&
              currentData[refId] !== ""
                ? currentData[refId]
                : (runningValues[refId] ?? "");
          });

          const result = evaluator.evaluate(
            config.expression,
            variables,
            config.returnType || "Text",
            config.blankPreference || "Empty",
            evaluatorFields,
            config.decimalPlaces ?? 2,
          );

          let final = result.success
            ? result.value
            : config.blankPreference === "Zero"
              ? 0
              : "";

          if (
            ["Number", "Currency", "Percent"].includes(config.returnType || "")
          ) {
            const num = Number(final);
            if (!isNaN(num)) {
              final = num.toFixed(config.decimalPlaces || 2);
              if (config.returnType === "Currency") final = `$${final}`;
              if (config.returnType === "Percent") final = `${final}%`;
            }
          }

          newValues[field.id] = final;
          runningValues[field.id] = result.value;
        } catch (err) {
          console.error(`Formula error in cell ${field.label}`, err);
          newValues[field.id] = "";
        }
      });

      setFormulaValues(newValues);
      onFormulasUpdated?.(newValues);
    },
    [formulaFields, evaluatorFields, onFormulasUpdated],
  );

  useEffect(() => {
    recalculateFormulas(initialRowData);
  }, [initialRowData, recalculateFormulas]);

  const handleCellChange = useCallback(
    (fieldId: string, newValue: any) => {
      const updatedRow = { ...initialRowData, [fieldId]: newValue };
      recalculateFormulas(updatedRow);
      return updatedRow;
    },
    [initialRowData, recalculateFormulas],
  );

  return { formulaValues, handleCellChange };
}
