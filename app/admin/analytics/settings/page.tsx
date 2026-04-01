'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Bell,
  Eye,
  Database,
  Shield,
  Save,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

export default function AnalyticsSettingsPage() {
  const [formTracking, setFormTracking] = useState<number[]>(Array.from({ length: 15 }, (_, i) => i + 1));
  const [exportFormat, setExportFormat] = useState(['csv', 'xlsx', 'pdf']);
  const [auditLogging, setAuditLogging] = useState(true);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);
  const [dataRetention, setDataRetention] = useState('90');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const forms = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    label: `Form Module ${i + 1}`,
  }));

  const handleToggleForm = (formId: number) => {
    setFormTracking(prev =>
      prev.includes(formId)
        ? prev.filter(id => id !== formId)
        : [...prev, formId]
    );
  };

  const handleSelectAllForms = () => {
    if (formTracking.length === forms.length) {
      setFormTracking([]);
    } else {
      setFormTracking(forms.map(f => f.id));
    }
  };

  const handleToggleExportFormat = (format: string) => {
    setExportFormat(prev =>
      prev.includes(format)
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSaveStatus('saved');
      toast.success('Settings saved successfully');

      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      toast.error('Failed to save settings');
      setSaveStatus('idle');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics Settings</h1>
            <p className="text-foreground/60 mt-2">Configure analytics collection and display preferences</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="tracking" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tracking">Form Tracking</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="audit">Audit Logging</TabsTrigger>
          <TabsTrigger value="data">Data Retention</TabsTrigger>
        </TabsList>

        {/* Form Tracking Tab */}
        <TabsContent value="tracking" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Form Module Tracking</CardTitle>
              <CardDescription>Select which form modules to track in analytics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-foreground/5">
                <Label className="font-medium cursor-pointer">Select All Forms</Label>
                <Checkbox
                  checked={formTracking.length === forms.length}
                  onCheckedChange={handleSelectAllForms}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {forms.map((form) => (
                  <div key={form.id} className="flex items-center space-x-3 p-3 rounded-lg bg-foreground/5 hover:bg-foreground/10 transition-colors">
                    <Checkbox
                      id={`form-${form.id}`}
                      checked={formTracking.includes(form.id)}
                      onCheckedChange={() => handleToggleForm(form.id)}
                    />
                    <Label htmlFor={`form-${form.id}`} className="cursor-pointer font-medium">
                      {form.label}
                    </Label>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200">
                <p className="font-medium flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  {formTracking.length} forms currently tracked
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Export Settings</CardTitle>
              <CardDescription>Configure available export formats</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {['csv', 'xlsx', 'pdf'].map((format) => (
                  <div key={format} className="flex items-center justify-between p-4 rounded-lg bg-foreground/5 hover:bg-foreground/10 transition-colors">
                    <div>
                      <Label className="font-medium capitalize cursor-pointer">{format} Format</Label>
                      <p className="text-sm text-foreground/60 mt-1">
                        {format === 'csv' && 'Comma-separated values for spreadsheet applications'}
                        {format === 'xlsx' && 'Microsoft Excel format with formatting support'}
                        {format === 'pdf' && 'Portable document format for sharing and archiving'}
                      </p>
                    </div>
                    <Checkbox
                      checked={exportFormat.includes(format)}
                      onCheckedChange={() => handleToggleExportFormat(format)}
                    />
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-200">
                <p className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {exportFormat.length} export formats enabled
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Logging Tab */}
        <TabsContent value="audit" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Audit Logging Configuration</CardTitle>
              <CardDescription>Control audit trail collection settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-foreground/5">
                  <div>
                    <Label className="font-medium">Enable Audit Logging</Label>
                    <p className="text-sm text-foreground/60 mt-1">Record all system activities and user actions</p>
                  </div>
                  <Checkbox
                    checked={auditLogging}
                    onCheckedChange={(v) => setAuditLogging(v === true)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-foreground/5">
                  <div>
                    <Label className="font-medium">Real-time Updates</Label>
                    <p className="text-sm text-foreground/60 mt-1">Show live audit logs as they occur</p>
                  </div>
                  <Checkbox
                    checked={realTimeUpdates}
                    onCheckedChange={(v) => setRealTimeUpdates(v === true)}
                    disabled={!auditLogging}
                  />
                </div>

                {auditLogging && (
                  <div className="p-4 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200">
                    <p className="font-medium flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Audit logging enabled - Recording all activities
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Tracked Events</CardTitle>
              <CardDescription>Audit logs capture the following event types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  'User login/logout',
                  'Form submissions',
                  'Data modifications',
                  'Permission changes',
                  'User account changes',
                  'Organization updates',
                  'Role assignments',
                  'Export operations',
                ].map((event) => (
                  <div key={event} className="flex items-center gap-2 p-3 rounded-lg bg-foreground/5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">{event}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Retention Tab */}
        <TabsContent value="data" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Data Retention Policy</CardTitle>
              <CardDescription>Configure how long analytics data is retained</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {['30', '60', '90', '180', '365'].map((days) => (
                  <div key={days} className="flex items-center p-4 rounded-lg bg-foreground/5 hover:bg-foreground/10 cursor-pointer transition-colors"
                    onClick={() => setDataRetention(days)}
                  >
                    <Checkbox
                      checked={dataRetention === days}
                      onCheckedChange={() => setDataRetention(days)}
                    />
                    <div className="ml-3">
                      <Label className="font-medium cursor-pointer">{days} Days</Label>
                      <p className="text-sm text-foreground/60 mt-1">
                        Data older than {days} days will be automatically archived
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200">
                <p className="font-medium">Current Setting</p>
                <p className="text-sm mt-1">Analytics data will be retained for {dataRetention} days before archival</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-6 border-t border-foreground/10">
        <Button
          variant="outline"
          onClick={() => {
            setSaveStatus('idle');
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="gap-2"
        >
          {saveStatus === 'saving' && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          )}
          {saveStatus === 'saved' ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
