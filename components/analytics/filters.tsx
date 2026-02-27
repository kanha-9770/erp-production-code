'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface TimeRangeFilterProps {
  onRangeChange: (range: string) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (start: string, end: string) => void;
}

export function TimeRangeFilter({
  onRangeChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
}: TimeRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeRange, setActiveRange] = useState('30days');

  const ranges = [
    { label: 'Today', value: 'today' },
    { label: 'Last 7 days', value: '7days' },
    { label: 'Last 30 days', value: '30days' },
    { label: 'Last 90 days', value: '90days' },
    { label: 'This Quarter', value: 'quarter' },
    { label: 'This Year', value: 'year' },
  ];

  const handleRangeSelect = (value: string) => {
    setActiveRange(value);
    onRangeChange(value);
    setIsOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="gap-2"
            size="sm"
          >
            <Calendar className="h-4 w-4" />
            {ranges.find(r => r.value === activeRange)?.label || 'Select Range'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3">
          <div className="space-y-2">
            {ranges.map((range) => (
              <Button
                key={range.value}
                variant={activeRange === range.value ? 'default' : 'ghost'}
                className="w-full justify-start"
                size="sm"
                onClick={() => handleRangeSelect(range.value)}
              >
                {range.label}
              </Button>
            ))}
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium mb-2 text-foreground/70">Custom Range</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={customStartDate || ''}
                    onChange={(e) => onCustomDateChange?.(e.target.value, customEndDate || '')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">End Date</label>
                  <Input
                    type="date"
                    value={customEndDate || ''}
                    onChange={(e) => onCustomDateChange?.(customStartDate || '', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface FormSelectorProps {
  selectedForms: number[];
  onFormChange: (forms: number[]) => void;
}

export function FormSelector({ selectedForms, onFormChange }: FormSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const forms = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    label: `Form Module ${i + 1}`,
  }));

  const handleToggleForm = (formId: number) => {
    if (selectedForms.includes(formId)) {
      onFormChange(selectedForms.filter(id => id !== formId));
    } else {
      onFormChange([...selectedForms, formId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedForms.length === forms.length) {
      onFormChange([]);
    } else {
      onFormChange(forms.map(f => f.id));
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          size="sm"
        >
          <Filter className="h-4 w-4" />
          Forms ({selectedForms.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">Select Form Modules</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="text-xs h-6"
            >
              {selectedForms.length === forms.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
            {forms.map((form) => (
              <div key={form.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`form-${form.id}`}
                  checked={selectedForms.includes(form.id)}
                  onCheckedChange={() => handleToggleForm(form.id)}
                />
                <label
                  htmlFor={`form-${form.id}`}
                  className="text-sm cursor-pointer"
                >
                  {form.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface AnalyticsToolbarProps {
  onRangeChange: (range: string) => void;
  selectedForms: number[];
  onFormChange: (forms: number[]) => void;
  onExport?: (format: 'csv' | 'pdf' | 'xlsx') => void;
}

export function AnalyticsToolbar({
  onRangeChange,
  selectedForms,
  onFormChange,
  onExport,
}: AnalyticsToolbarProps) {
  return (
    <Card className="border-0 shadow-lg mb-6">
      <CardHeader className="pb-4">
        <CardTitle>Analytics Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 items-center">
          <TimeRangeFilter onRangeChange={onRangeChange} />
          <FormSelector selectedForms={selectedForms} onFormChange={onFormChange} />
          
          {onExport && (
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport('csv')}
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport('xlsx')}
              >
                Export XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport('pdf')}
              >
                Export PDF
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
