"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Check, ChevronsUpDown, Loader2, Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLazyGetLookupDataQuery } from "@/lib/api/lookup";

interface LookupDependencyConfig {
  parentFieldLabel: string;
  valueMappings: {
    parentValue: string;
    allowedChildValues: string[];
  }[];
}

interface LookupFieldProps {
  field: {
    id: string;
    label: string;
    type: string;
    placeholder?: string | undefined;
    description?: string | null | undefined;
    validation: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      patternMessage?: string;
    };
    lookup?: {
      sourceId?: string;
      multiple?: boolean;
      searchable?: boolean;
      searchPlaceholder?: string;
      allowCustomValues?: boolean;
      useIdField?: boolean;
      idFieldName?: string;
      fieldMapping?: {
        display: string;
        value: string;
        store: string;
        description?: string | null;
      };
      dependency?: LookupDependencyConfig;
    };
  };
  value?: any;
  onChange?: (value: any, fullOption?: any) => void;
  disabled?: boolean;
  error?: string;
  /** Current value of the parent field (for dependency filtering) */
  parentValue?: string;
}

interface LookupOption {
  id: string;
  label: string;
  value: string;
  storeValue: any;
  description?: string | null;
  data?: any;
  type?: string;
  isCustom?: boolean;
}

export function LookupField({
  field,
  value,
  onChange,
  disabled = false,
  error,
  parentValue,
}: LookupFieldProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<LookupOption[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const isMultiple = field.lookup?.multiple || false;
  const isSearchable = field.lookup?.searchable !== false;
  const allowCustomValues = field.lookup?.allowCustomValues !== false;
  const useIdField = field.lookup?.useIdField || false;
  const idFieldName = field.lookup?.idFieldName;
  const sourceId = field.lookup?.sourceId;
  const dependency = field.lookup?.dependency;
  const [triggerGetLookupData] = useLazyGetLookupDataQuery();

  // Filter options based on dependency when parent value changes
  const filteredByDependency = useMemo(() => {
    if (!dependency || !parentValue) return options;
    const mapping = dependency.valueMappings.find(
      (m) => m.parentValue === parentValue
    );
    if (!mapping) return options; // No mapping configured for this parent value — show all
    return options.filter((opt) =>
      mapping.allowedChildValues.includes(String(opt.storeValue)) ||
      mapping.allowedChildValues.includes(String(opt.label))
    );
  }, [options, dependency, parentValue]);

  // Clear child selection when parent value changes and current value is no longer allowed
  const prevParentRef = useRef(parentValue);
  useEffect(() => {
    if (!dependency || prevParentRef.current === parentValue) {
      prevParentRef.current = parentValue;
      return;
    }
    prevParentRef.current = parentValue;
    if (!parentValue || !value) return;

    const mapping = dependency.valueMappings.find(
      (m) => m.parentValue === parentValue
    );
    if (!mapping) return; // No mapping — don't auto-clear

    if (isMultiple && Array.isArray(value)) {
      const filtered = value.filter(
        (v: any) => mapping.allowedChildValues.includes(String(v))
      );
      if (filtered.length !== value.length) {
        onChange?.(filtered, null);
      }
    } else if (!isMultiple && value) {
      if (!mapping.allowedChildValues.includes(String(value))) {
        onChange?.(null, null);
      }
    }
  }, [parentValue]);

  useEffect(() => {
    if (value && (options.length > 0 || allowCustomValues)) {
      if (isMultiple && Array.isArray(value)) {
        const selected = value.map((val) => {
          const existingOption = options.find((opt) => opt.storeValue === val);
          if (existingOption) {
            return existingOption;
          }
          return {
            id: `custom-${String(val)}`,
            label: String(val),
            value: String(val),
            storeValue: val,
            isCustom: true,
            type: "text",
          };
        });
        setSelectedOptions(selected);
      } else if (!isMultiple && value) {
        const existingOption = options.find((opt) => opt.storeValue === value);
        if (existingOption) {
          setSelectedOptions([existingOption]);
        } else if (allowCustomValues) {
          const customOption = {
            id: `custom-${String(value)}`,
            label: String(value),
            value: String(value),
            storeValue: value,
            isCustom: true,
            type: "text",
          };
          setSelectedOptions([customOption]);
        }
      }
    } else if (!value) {
      setSelectedOptions([]);
    }
  }, [value, options, isMultiple, allowCustomValues]);

  useEffect(() => {
    if (sourceId) {
      fetchOptions();
    }
  }, [sourceId]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (sourceId && isSearchable) {
        fetchOptions(searchTerm);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, sourceId, isSearchable]);

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const day = ('0' + d.getDate()).slice(-2);
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const year = d.getFullYear(); // This gets the full 4-digit year

    return `${day}-${month}-${year}`;
  };

  const fetchOptions = async (search = "") => {
    if (!sourceId) {
      console.log("No sourceId provided for LookupField");
      return;
    }

    setLoading(true);
    try {
      const result = await triggerGetLookupData({
        sourceId,
        search,
        limit: "50",
      }).unwrap();

      if (result.success) {
        const transformedOptions: LookupOption[] = result.data.map(
          (item: any) => {
            const mapping = field.lookup?.fieldMapping || {
              display: "New Text",
              value: "record_id",
              store: "New Text",
              description: null,
            };

            const fieldData =
              item[mapping.display] ||
              Object.values(item).find(
                (val: any) => val?.field_label === mapping.display
              ) ||
              Object.values(item).find(
                (val: any) => val?.field_id === mapping.display
              ) ||
              item["New Text"] ||
              {};

            const storeData =
              item[mapping.store] ||
              Object.values(item).find(
                (val: any) => val?.field_label === mapping.store
              ) ||
              Object.values(item).find(
                (val: any) => val?.field_id === mapping.store
              ) ||
              fieldData;

            let fieldValue =
              fieldData.field_value ?? item[mapping.display] ?? "Unknown";
            let storeValue = storeData.field_value ?? fieldValue;

            if (fieldValue === undefined) {
              console.log(
                `Undefined field_value for display: ${mapping.display}`,
                { item, fieldData }
              );
              fieldValue = `Item ${item.record_id}`;
            }

            if (storeValue === undefined) {
              console.log(`Undefined storeValue for store: ${mapping.store}`, {
                item,
                storeData,
              });
              storeValue = fieldValue;
            }

            let displayLabel = fieldValue;
            if (displayLabel === "Unknown") {
              // Fallback to meaningful label if no value found
              displayLabel = item._formName
                ? `${item._formName} (${new Date(item.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })})`
                : `Record ${item.record_id.slice(0, 8)}`;
            }

            const fieldType = fieldData.field_type || "text";
            const storeType = storeData.field_type || fieldType;

            if (fieldType === "datetime" && fieldValue) {
              displayLabel = formatDate(fieldValue);
            } else if (fieldType === "date" && fieldValue) {
              displayLabel = formatDate(fieldValue);
            } else if (fieldType === "number") {
              displayLabel = Number(fieldValue).toString();
            }

            if (storeType === "datetime" && storeValue) {
              storeValue = formatDate(storeValue);
            } else if (storeType === "date" && storeValue) {
              storeValue = formatDate(storeValue);
            } else if (storeType === "number") {
              storeValue = Number(storeValue);
            }

            return {
              id: item.record_id || String(Math.random()),
              label: displayLabel,
              value:
                item[mapping.value] || item.record_id || String(Math.random()),
              storeValue: storeValue,
              description:
                mapping.description && item[mapping.description]
                  ? item[mapping.description].field_value
                  : item.description,
              data: item,
              type: fieldType,
              isCustom: false,
            };
          }
        );

        console.log(
          `Fetched ${transformedOptions.length} options for source ${sourceId}`,
          {
            options: transformedOptions,
          }
        );

        setOptions(transformedOptions);
      } else {
        console.log("Failed to fetch lookup options:", result.error);
        setOptions([]);
      }
    } catch (error) {
      console.log("Error fetching lookup options:", error);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (option: LookupOption) => {
    if (isMultiple) {
      const isSelected = selectedOptions.some(
        (selected) => selected.value === option.value
      );
      let newSelected: LookupOption[];

      if (isSelected) {
        newSelected = selectedOptions.filter(
          (selected) => selected.value !== option.value
        );
      } else {
        newSelected = [...selectedOptions, option];
      }

      setSelectedOptions(newSelected);
      onChange?.(
        newSelected.map((opt) => opt.storeValue),
        newSelected
      );
    } else {
      setSelectedOptions([option]);
      onChange?.(option.storeValue, option);
      setOpen(false);
    }
  };

  const handleCreateCustom = () => {
    if (!searchTerm.trim() || !allowCustomValues) return;

    const customOption: LookupOption = {
      id: `custom-${Date.now()}`,
      label: searchTerm.trim(),
      value: searchTerm.trim(),
      storeValue: searchTerm.trim(),
      isCustom: true,
      type: "text",
    };

    const existsInSelected = selectedOptions.some(
      (opt) => opt.storeValue === customOption.storeValue
    );
    if (existsInSelected) return;

    if (isMultiple) {
      const newSelected = [...selectedOptions, customOption];
      setSelectedOptions(newSelected);
      onChange?.(
        newSelected.map((opt) => opt.storeValue),
        newSelected
      );
    } else {
      setSelectedOptions([customOption]);
      onChange?.(customOption.storeValue, customOption);
      setOpen(false);
    }

    setSearchTerm("");
  };

  const handleRemove = (optionToRemove: LookupOption) => {
    if (isMultiple) {
      const newSelected = selectedOptions.filter(
        (selected) => selected.value !== optionToRemove.value
      );
      setSelectedOptions(newSelected);
      onChange?.(
        newSelected.map((opt) => opt.storeValue),
        newSelected
      );
    } else {
      setSelectedOptions([]);
      onChange?.(null, null);
    }
  };

  const displayValue = () => {
    if (selectedOptions.length === 0) {
      return field.placeholder || "Select...";
    }

    if (isMultiple) {
      return `${selectedOptions.length} selected`;
    }

    return selectedOptions[0].storeValue;
  };

  // Use dependency-filtered options for display
  const displayOptions = filteredByDependency;

  const searchMatchesExisting = displayOptions.some(
    (option) =>
      String(option.storeValue).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const searchExistsInSelected = selectedOptions.some(
    (opt) => opt.storeValue === searchTerm.trim()
  );

  const showCreateOption =
    allowCustomValues &&
    searchTerm.trim() &&
    !searchMatchesExisting &&
    !searchExistsInSelected;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              !selectedOptions.length && "text-muted-foreground",
              error && "border-red-500"
            )}
            disabled={disabled || (!!dependency && !parentValue)}
          >
            <span className="truncate">{displayValue()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            {isSearchable && (
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <Input
                  placeholder={
                    field.lookup?.searchPlaceholder ||
                    "Search or type to create..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && showCreateOption) {
                      e.preventDefault();
                      handleCreateCustom();
                    }
                  }}
                />
              </div>
            )}

            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2 text-sm">Loading...</span>
                </div>
              ) : (
                <CommandGroup>
                  <ScrollArea className="max-h-[320px] overflow-y-auto">
                    {showCreateOption && (
                      <CommandItem
                        onSelect={handleCreateCustom}
                        className="flex items-center cursor-pointer hover:bg-accent"
                      >
                        <Plus className="mr-2 h-4 w-4 text-green-600" />
                        <div>
                          <div className="font-medium text-green-600">
                            Create "{searchTerm.trim()}"
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {useIdField
                              ? `Add as new value (will ${idFieldName
                                ? `update if ${idFieldName} matches`
                                : "create new record"
                              })`
                              : "Add as new custom value"}
                          </div>
                        </div>
                      </CommandItem>
                    )}

                    {displayOptions.length === 0 && !showCreateOption ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        {dependency && !parentValue
                          ? "Select the parent field first."
                          : allowCustomValues
                            ? "No options found. Type to create a custom value."
                            : "No options found."}
                      </div>
                    ) : (
                      displayOptions.map((option) => {
                        const isSelected = selectedOptions.some(
                          (selected) => selected.value === option.value
                        );
                        return (
                          <CommandItem
                            key={option.value}
                            value={option.label}
                            onSelect={() => handleSelect(option)}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div>
                                <div className="font-medium">
                                  {option.label}
                                </div>
                                {option.description && (
                                  <div className="text-xs text-muted-foreground">
                                    {option.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        );
                      })
                    )}
                  </ScrollArea>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {isMultiple && selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge
              key={option.value}
              variant={option.isCustom ? "default" : "secondary"}
              className="text-xs"
            >
              {option.isCustom && <Plus className="mr-1 h-3 w-3" />}
              {option.label}
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-auto p-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleRemove(option)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {allowCustomValues && !useIdField && (
        <p className="text-xs text-muted-foreground">
          Type to search existing values or create new ones
        </p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

export default LookupField;