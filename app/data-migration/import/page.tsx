// // app/data-migration/import/page.tsx
// "use client";
// import { useState, useEffect } from "react";
// import { ChevronLeft } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { ProgressStepper } from "@/components/data-migration/progress-stepper";
// import { ModuleGrid } from "@/components/data-migration/module-grid";
// import {
//   FileUpload,
//   type ParsedFilePreview,
// } from "@/components/data-migration/file-upload";
// import { FieldMappingTable } from "@/components/data-migration/field-mapping-table";
// import { ReviewSummary } from "@/components/data-migration/review-summary";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Label } from "@/components/ui/label";
// import { Switch } from "@/components/ui/switch";
// import { useToast } from "@/hooks/use-toast";

// interface Step {
//   number: number;
//   label: string;
//   status: "completed" | "current" | "upcoming";
// }

// export default function ImportWizardPage() {
//   const [currentStep, setCurrentStep] = useState(1);
//   const [selectedModuleId, setSelectedModuleId] = useState<string>("");
//   const [selectedFormId, setSelectedFormId] = useState<string>("");
//   const [uploadedFile, setUploadedFile] = useState<{
//     file: File;
//     preview: ParsedFilePreview;
//   } | null>(null);
//   const [mappings, setMappings] = useState<
//     Array<{
//       sourceColumn: string;
//       targetFieldId: string | null;
//       sampleData: string[];
//     }>
//   >([]);
//   const [duplicateHandling, setDuplicateHandling] = useState<
//     "insert" | "update" | "upsert"
//   >("insert");
//   const [importOptions, setImportOptions] = useState({
//     enableWorkflows: false,
//     enableValidation: true,
//     enableApprovals: false,
//   });

//   const [modules, setModules] = useState<any[]>([]);
//   const [forms, setForms] = useState<any[]>([]);
//   const [selectedForm, setSelectedForm] = useState<any>(null);
//   const [loadingModules, setLoadingModules] = useState(true);
//   const [loadingForms, setLoadingForms] = useState(false);
//   const [loadingFormDetails, setLoadingFormDetails] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const { toast } = useToast();

//   useEffect(() => {
//     const fetchModules = async () => {
//       console.log("[ImportWizard] Starting fetchModules");
//       try {
//         setLoadingModules(true);
//         setError(null);
//         const res = await fetch("/api/modules");
//         console.log("[ImportWizard] Modules API response status:", res.status);
//         if (!res.ok) throw new Error("Failed to fetch modules");
//         const data = await res.json();
//         console.log("[ImportWizard] Modules API response data:", {
//           success: data.success,
//           dataLength: data.data?.length,
//         });
//         if (!data.success)
//           throw new Error(data.error || "Failed to load modules");

//         const flattenedModules: any[] = [];
//         const processModule = (mod: any) => {
//           flattenedModules.push({
//             id: mod.id,
//             name: mod.name,
//             label: mod.name,
//             fileCount: mod.forms?.length || 0,
//             mappingStatus: "unmapped" as const,
//           });
//           mod.children?.forEach(processModule);
//         };
//         data.data.forEach(processModule);
//         console.log(
//           "[ImportWizard] Flattened modules count:",
//           flattenedModules.length
//         );
//         setModules(flattenedModules);
//       } catch (err: any) {
//         console.error("[ImportWizard] Failed to load modules:", err);
//         setError(err.message);
//         toast({
//           title: "Error",
//           description: "Failed to load modules.",
//           variant: "destructive",
//         });
//       } finally {
//         setLoadingModules(false);
//         console.log("[ImportWizard] fetchModules completed");
//       }
//     };
//     fetchModules();
//   }, [toast]);

//   const handleModuleSelect = async (moduleId: string) => {
//     console.log(
//       "[ImportWizard] handleModuleSelect called with moduleId:",
//       moduleId
//     );
//     setSelectedModuleId(moduleId);
//     setSelectedFormId("");
//     setSelectedForm(null);
//     setForms([]);
//     setLoadingForms(true);

//     try {
//       const res = await fetch("/api/modules");
//       console.log(
//         "[ImportWizard] Reload modules API response status:",
//         res.status
//       );
//       if (!res.ok) throw new Error("Failed to reload modules");
//       const data = await res.json();
//       console.log("[ImportWizard] Reload modules API response data:", {
//         success: data.success,
//         dataLength: data.data?.length,
//       });

//       if (!data.success) throw new Error("Invalid response");

//       let moduleForms: any[] = [];
//       const findForms = (mod: any): boolean => {
//         if (mod.id === moduleId) {
//           moduleForms = mod.forms || [];
//           return true;
//         }
//         if (mod.children) {
//           for (const child of mod.children) {
//             if (findForms(child)) return true;
//           }
//         }
//         return false;
//       };
//       data.data.some(findForms);
//       console.log("[ImportWizard] Found forms for module:", moduleForms.length);
//       setForms(moduleForms);

//       if (moduleForms.length > 0) {
//         setSelectedFormId(moduleForms[0].id);
//         console.log(
//           "[ImportWizard] Auto-selected first formId:",
//           moduleForms[0].id
//         );
//       }
//     } catch (err: any) {
//       console.error("[ImportWizard] handleModuleSelect error:", err);
//       toast({
//         title: "Error",
//         description: "Failed to load forms.",
//         variant: "destructive",
//       });
//     } finally {
//       setLoadingForms(false);
//       console.log("[ImportWizard] handleModuleSelect completed");
//     }
//   };

//   const fetchFormDetails = async (formId: string) => {
//     console.log("[ImportWizard] fetchFormDetails called with formId:", formId);
//     setLoadingFormDetails(true);
//     try {
//       const res = await fetch(`/api/forms/${formId}`);
//       console.log(
//         "[ImportWizard] Form details API response status:",
//         res.status
//       );
//       if (!res.ok) throw new Error("Failed to fetch form");
//       const data = await res.json();
//       console.log("[ImportWizard] Form details API response data:", {
//         success: data.success,
//         data: data.data
//           ? {
//               id: data.data.id,
//               name: data.data.name,
//               sectionsCount: data.data.sections?.length,
//             }
//           : null,
//       });
//       if (!data.success) throw new Error(data.error || "Form not found");
//       setSelectedForm(data.data);
//     } catch (err: any) {
//       console.error("[ImportWizard] Failed to load form:", err);
//       toast({
//         title: "Error",
//         description: "Failed to load form fields.",
//         variant: "destructive",
//       });
//       setSelectedForm(null);
//     } finally {
//       setLoadingFormDetails(false);
//       console.log("[ImportWizard] fetchFormDetails completed");
//     }
//   };

//   useEffect(() => {
//     console.log("[ImportWizard] useEffect for selectedFormId:", selectedFormId);
//     if (selectedFormId) fetchFormDetails(selectedFormId);
//     else setSelectedForm(null);
//   }, [selectedFormId]);

//   const steps: Step[] = [
//     {
//       number: 1,
//       label: "Upload",
//       status:
//         currentStep > 1
//           ? "completed"
//           : currentStep === 1
//           ? "current"
//           : "upcoming",
//     },
//     {
//       number: 2,
//       label: "Module - File Mapping",
//       status:
//         currentStep > 2
//           ? "completed"
//           : currentStep === 2
//           ? "current"
//           : "upcoming",
//     },
//     {
//       number: 3,
//       label: "Field Mapping",
//       status:
//         currentStep > 3
//           ? "completed"
//           : currentStep === 3
//           ? "current"
//           : "upcoming",
//     },
//     {
//       number: 4,
//       label: "Review",
//       status:
//         currentStep > 4
//           ? "completed"
//           : currentStep === 4
//           ? "current"
//           : "upcoming",
//     },
//     {
//       number: 5,
//       label: "Finish",
//       status: currentStep === 5 ? "current" : "upcoming",
//     },
//   ];

//   const normalizeKey = (str: string): string => {
//     return String(str)
//       .replace(/[\u2018\u2019]/g, "'")
//       .trim();
//   };

//   const handleFileUpload = (file: File, preview: ParsedFilePreview) => {
//     console.log(
//       "[ImportWizard] handleFileUpload called with file:",
//       file.name,
//       "preview rows:",
//       preview.rows.length
//     );
//     const normalizedHeaders = preview.headers.map((h) =>
//       normalizeKey(String(h))
//     );
//     const normalizedPreview = { ...preview, headers: normalizedHeaders };

//     const newMappings = normalizedHeaders.map((header, idx) => ({
//       sourceColumn: header,
//       targetFieldId: null,
//       sampleData: preview.rows
//         .slice(0, 3)
//         .map((row) => String(row[idx] || "").trim()),
//     }));

//     console.log(
//       "[ImportWizard] Generated newMappings count:",
//       newMappings.length
//     );
//     setUploadedFile({ file, preview: normalizedPreview });
//     setMappings(newMappings);
//   };

//   const handleMappingChange = (
//     sourceColumn: string,
//     targetFieldId: string | null
//   ) => {
//     console.log("[ImportWizard] handleMappingChange:", {
//       sourceColumn,
//       targetFieldId,
//     });
//     setMappings((prev) =>
//       prev.map((m) =>
//         m.sourceColumn === sourceColumn ? { ...m, targetFieldId } : m
//       )
//     );
//   };

//   const handleStartMigration = async () => {
//     console.log("[ImportWizard] handleStartMigration started");
//     if (!uploadedFile || !selectedFormId) {
//       console.error("[ImportWizard] Missing prerequisites:", {
//         uploadedFile: !!uploadedFile,
//         selectedFormId,
//       });
//       return;
//     }

//     try {
//       setCurrentStep(5);
//       console.log("[ImportWizard] Step set to 5 (processing)");

//       console.log("[ImportWizard] Creating job with payload:", {
//         moduleId: selectedModuleId,
//         formId: selectedFormId,
//         fileName: uploadedFile.file.name,
//         fileSize: uploadedFile.file.size,
//         duplicateHandling,
//         importOptions,
//       });
//       const jobRes = await fetch("/api/import/create-job", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           moduleId: selectedModuleId,
//           formId: selectedFormId,
//           fileName: uploadedFile.file.name,
//           fileSize: uploadedFile.file.size,
//           duplicateHandling,
//           importOptions,
//         }),
//       });

//       console.log("[ImportWizard] Create job response status:", jobRes.status);
//       const jobText = await jobRes.text();
//       console.log(
//         "[ImportWizard] Create job response body (text):",
//         jobText.substring(0, 500)
//       );
//       let jobData;
//       try {
//         jobData = JSON.parse(jobText);
//       } catch (parseErr) {
//         console.error(
//           "[ImportWizard] Failed to parse create job as JSON:",
//           parseErr
//         );
//         throw new Error(
//           `Invalid JSON from /api/import/create-job: ${jobText.substring(
//             0,
//             200
//           )}`
//         );
//       }
//       console.log("[ImportWizard] Create job response data:", jobData);
//       if (!jobData.success)
//         throw new Error(jobData.error || "Failed to create job");

//       const normalizedMappings = mappings
//         .filter((m) => m.targetFieldId)
//         .map((m) => ({
//           sourceColumn: normalizeKey(m.sourceColumn),
//           targetFieldId: m.targetFieldId!,
//         }));

//       console.log(
//         "[ImportWizard] Normalized mappings count:",
//         normalizedMappings.length,
//         "Sample:",
//         normalizedMappings.slice(0, 2)
//       );

//       if (normalizedMappings.length === 0) {
//         throw new Error("No fields mapped. Please map at least one field.");
//       }

//       console.log("[ImportWizard] Saving mappings with payload:", {
//         importJobId: jobData.importJobId,
//         mappingsCount: normalizedMappings.length,
//       });
//       const saveRes = await fetch("/api/import/add-mapping", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           importJobId: jobData.importJobId,
//           mappings: normalizedMappings,
//         }),
//       });

//       console.log(
//         "[ImportWizard] Save mappings response status:",
//         saveRes.status
//       );
//       console.log(
//         "[ImportWizard] Save mappings response headers:",
//         Object.fromEntries(saveRes.headers.entries())
//       );

//       // Always read as text first to debug
//       const saveText = await saveRes.text();
//       if (!saveText.trim()) {
//         throw new Error("Empty response body from /api/import/add-mapping");
//       }
//       console.log(
//         "[ImportWizard] Save mappings response body (text):",
//         saveText.substring(0, 500) + (saveText.length > 500 ? "..." : "")
//       );

//       let saveData;
//       try {
//         saveData = JSON.parse(saveText);
//         console.log("[ImportWizard] Save mappings parsed JSON:", saveData);
//       } catch (parseErr) {
//         console.error(
//           "[ImportWizard] Failed to parse save mappings as JSON:",
//           parseErr
//         );
//         throw new Error(
//           `Invalid JSON response from /api/import/add-mapping: ${saveText.substring(
//             0,
//             200
//           )}`
//         );
//       }

//       if (!saveRes.ok) {
//         const err = saveData.error || "Unknown error";
//         console.error("[ImportWizard] Save mappings error response:", err);
//         throw new Error(`Failed to save mappings: ${saveRes.status} ${err}`);
//       }

//       const rows = uploadedFile.preview.rows.map((row) => {
//         const obj: Record<string, string> = {};
//         uploadedFile.preview.headers.forEach((header, i) => {
//           obj[normalizeKey(header)] = String(row[i] || "").trim();
//         });
//         return obj;
//       });

//       console.log(
//         "[ImportWizard] Prepared rows count:",
//         rows.length,
//         "Sample row keys:",
//         Object.keys(rows[0] || {})
//       );

//       console.log("[ImportWizard] Processing rows with payload:", {
//         importJobId: jobData.importJobId,
//         rowsCount: rows.length,
//       });
//       const processRes = await fetch("/api/import/process", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           importJobId: jobData.importJobId,
//           rows,
//         }),
//       });

//       console.log("[ImportWizard] Process response status:", processRes.status);
//       console.log(
//         "[ImportWizard] Process response headers:",
//         Object.fromEntries(processRes.headers.entries())
//       );

//       // Same for process
//       const processText = await processRes.text();
//       if (!processText.trim()) {
//         throw new Error("Empty response body from /api/import/process");
//       }
//       console.log(
//         "[ImportWizard] Process response body (text):",
//         processText.substring(0, 500) + (processText.length > 500 ? "..." : "")
//       );

//       let result;
//       try {
//         result = JSON.parse(processText);
//         console.log("[ImportWizard] Process parsed JSON:", result);
//       } catch (parseErr) {
//         console.error(
//           "[ImportWizard] Failed to parse process as JSON:",
//           parseErr
//         );
//         throw new Error(
//           `Invalid JSON response from /api/import/process: ${processText.substring(
//             0,
//             200
//           )}`
//         );
//       }

//       if (!processRes.ok) {
//         const err = result.error || "Unknown error";
//         throw new Error(`Process failed: ${processRes.status} ${err}`);
//       }

//       if (!result.success) throw new Error(result.error || "Import failed");

//       toast({
//         title: "Success!",
//         description: `${result.successCount} rows imported successfully!`,
//       });

//       setTimeout(() => (window.location.href = "/"), 2000);
//     } catch (err: any) {
//       console.error("[ImportWizard] Migration error:", err);
//       toast({
//         title: "Import Failed",
//         description: err.message || "Something went wrong.",
//         variant: "destructive",
//       });
//       setCurrentStep(4);
//     }
//   };

//   const sampleData = uploadedFile
//     ? uploadedFile.preview.headers.reduce((acc, header, idx) => {
//         acc[normalizeKey(header)] = uploadedFile.preview.rows.map((r) =>
//           String(r[idx] || "").trim()
//         );
//         return acc;
//       }, {} as Record<string, string[]>)
//     : {};

//   const targetSections =
//     selectedForm?.sections?.map((section: any) => ({
//       id: section.id,
//       label: section.title,
//       order: section.order,
//       fields:
//         section.fields?.map((field: any) => ({
//           id: field.id,
//           name: field.label,
//           label: field.label,
//           fieldType: field.type,
//           isRequired: field.validation?.required || false,
//           isImportable: true,
//           isExportable: true,
//           isUnique: false,
//           lookupDisplayFields: [],
//         })) || [],
//     })) || [];

//   return (
//     <div className="min-h-screen bg-background">
//       <ProgressStepper steps={steps} />

//       <div className="container mx-auto px-6 py-8">
//         {/* Step 1 */}
//         {currentStep === 1 && (
//           <Card>
//             <CardHeader>
//               <CardTitle>Upload Your Data File</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <FileUpload
//                 onFileUpload={handleFileUpload}
//                 uploadedFile={uploadedFile}
//                 onFileRemove={() => setUploadedFile(null)}
//               />
//               <div className="flex justify-end mt-6">
//                 <Button
//                   onClick={() => setCurrentStep(2)}
//                   disabled={!uploadedFile}
//                 >
//                   Continue
//                 </Button>
//               </div>
//             </CardContent>
//           </Card>
//         )}

//         {/* Step 2 */}
//         {currentStep === 2 && (
//           <div className="space-y-6">
//             <div className="flex items-center justify-between">
//               <h2 className="text-2xl font-bold">Select Module</h2>
//               <Button variant="default">Create New Module</Button>
//             </div>

//             {loadingModules ? (
//               <p className="text-center py-12">Loading modules...</p>
//             ) : error ? (
//               <p className="text-red-600 text-center">{error}</p>
//             ) : (
//               <ModuleGrid
//                 modules={modules}
//                 onModuleClick={handleModuleSelect}
//                 selectedModuleId={selectedModuleId}
//               />
//             )}

//             {selectedModuleId && (
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Select Form</CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   {loadingForms ? (
//                     <p className="text-center">Loading forms...</p>
//                   ) : forms.length === 0 ? (
//                     <p>No forms</p>
//                   ) : (
//                     <Select
//                       value={selectedFormId}
//                       onValueChange={setSelectedFormId}
//                     >
//                       <SelectTrigger>
//                         <SelectValue placeholder="Choose a form" />
//                       </SelectTrigger>
//                       <SelectContent>
//                         {forms.map((f) => (
//                           <SelectItem key={f.id} value={f.id}>
//                             {f.name}
//                           </SelectItem>
//                         ))}
//                       </SelectContent>
//                     </Select>
//                   )}
//                 </CardContent>
//               </Card>
//             )}

//             <div className="flex justify-between">
//               <Button variant="outline" onClick={() => setCurrentStep(1)}>
//                 <ChevronLeft className="w-4 h-4 mr-2" /> Back
//               </Button>
//               <Button
//                 onClick={() => setCurrentStep(3)}
//                 disabled={!selectedFormId}
//               >
//                 Continue
//               </Button>
//             </div>
//           </div>
//         )}

//         {/* Step 3 - THE FIXED VERSION */}
//         {currentStep === 3 && (
//           <div className="space-y-6">
//             <Card>
//               <CardHeader>
//                 <div className="flex items-center justify-between">
//                   <CardTitle>Map Fields</CardTitle>
//                   <Button variant="default">+ Create New Fields</Button>
//                 </div>
//               </CardHeader>
//               <CardContent>
//                 {loadingFormDetails ? (
//                   <div className="text-center py-8">Loading form fields...</div>
//                 ) : (
//                   <FieldMappingTable
//                     sourceColumns={mappings.map((m) => m.sourceColumn)}
//                     targetSections={targetSections}
//                     mappings={mappings}
//                     onMappingChange={handleMappingChange}
//                     sampleData={sampleData}
//                   />
//                 )}
//               </CardContent>
//             </Card>

//             <Card>
//               <CardHeader>
//                 <CardTitle>Duplicate Handling</CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-4">
//                 <div className="space-y-2">
//                   <Label>Choose how to handle duplicates</Label>
//                   <Select
//                     value={duplicateHandling}
//                     onValueChange={(v: any) => setDuplicateHandling(v)}
//                   >
//                     <SelectTrigger>
//                       <SelectValue />
//                     </SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="insert">
//                         Insert only (skip duplicates)
//                       </SelectItem>
//                       <SelectItem value="update">
//                         Update existing only
//                       </SelectItem>
//                       <SelectItem value="upsert">
//                         Upsert (insert new + update existing)
//                       </SelectItem>
//                     </SelectContent>
//                   </Select>
//                 </div>
//               </CardContent>
//             </Card>

//             <Card>
//               <CardHeader>
//                 <CardTitle>Import Options</CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-4">
//                 <div className="flex items-center justify-between">
//                   <Label htmlFor="workflows">Enable workflows</Label>
//                   <Switch
//                     id="workflows"
//                     checked={importOptions.enableWorkflows}
//                     onCheckedChange={(c) =>
//                       setImportOptions((p) => ({ ...p, enableWorkflows: c }))
//                     }
//                   />
//                 </div>
//                 <div className="flex items-center justify-between">
//                   <Label htmlFor="validation">Enable validation rules</Label>
//                   <Switch
//                     id="validation"
//                     checked={importOptions.enableValidation}
//                     onCheckedChange={(c) =>
//                       setImportOptions((p) => ({ ...p, enableValidation: c }))
//                     }
//                   />
//                 </div>
//                 <div className="flex items-center justify-between">
//                   <Label htmlFor="approvals">Enable approval processes</Label>
//                   <Switch
//                     id="approvals"
//                     checked={importOptions.enableApprovals}
//                     onCheckedChange={(c) =>
//                       setImportOptions((p) => ({ ...p, enableApprovals: c }))
//                     }
//                   />
//                 </div>
//               </CardContent>
//             </Card>

//             <div className="flex justify-between">
//               <Button variant="outline" onClick={() => setCurrentStep(2)}>
//                 <ChevronLeft className="w-4 h-4 mr-2" /> Back
//               </Button>
//               <Button onClick={() => setCurrentStep(4)}>
//                 Continue to Review
//               </Button>
//             </div>
//           </div>
//         )}

//         {/* Step 4 - With debug */}
//         {currentStep === 4 && (
//           <div className="space-y-6">
//             <div className="text-center p-4 bg-green-50 rounded-lg mb-6">
//               <p className="text-lg font-bold text-green-800">
//                 Mapped Fields: {mappings.filter((m) => m.targetFieldId).length}{" "}
//                 / {mappings.length}
//               </p>
//             </div>

//             <ReviewSummary
//               fileMappingStatus={{
//                 mappedFiles: uploadedFile ? 1 : 0,
//                 unmappedFiles: 0,
//                 unsupportedFiles: 0,
//               }}
//               moduleSummaries={[
//                 {
//                   moduleName: selectedForm?.name || "Selected Form",
//                   fileCount: uploadedFile ? 1 : 0,
//                   mappedFields: mappings.filter((m) => m.targetFieldId).length,
//                   unmappedFields: mappings.filter((m) => !m.targetFieldId)
//                     .length,
//                   percentage: mappings.length
//                     ? Math.round(
//                         (mappings.filter((m) => m.targetFieldId).length /
//                           mappings.length) *
//                           100
//                       )
//                     : 0,
//                 },
//               ]}
//             />

//             <div className="flex justify-between">
//               <Button variant="outline" onClick={() => setCurrentStep(3)}>
//                 Back
//               </Button>
//               <Button
//                 onClick={handleStartMigration}
//                 size="lg"
//                 disabled={mappings.filter((m) => m.targetFieldId).length === 0}
//               >
//                 Start Migration
//               </Button>
//             </div>
//           </div>
//         )}

//         {/* Step 5 */}
//         {currentStep === 5 && (
//           <Card>
//             <CardContent className="flex flex-col items-center justify-center py-16">
//               <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
//               <h3 className="text-xl font-semibold mb-2">Import in Progress</h3>
//               <p className="text-muted-foreground">
//                 Processing your data... Please wait.
//               </p>
//             </CardContent>
//           </Card>
//         )}
//       </div>
//     </div>
//   );
// }



// app/data-migration/import/page.tsx
"use client";
import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressStepper } from "@/components/data-migration/progress-stepper";
import { ModuleGrid } from "@/components/data-migration/module-grid";
import {
  FileUpload,
  type ParsedFilePreview,
} from "@/components/data-migration/file-upload";
import { FieldMappingTable } from "@/components/data-migration/field-mapping-table";
import { ReviewSummary } from "@/components/data-migration/review-summary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Step {
  number: number;
  label: string;
  status: "completed" | "current" | "upcoming";
}

type MappingTarget = {
  sectionId: string | null;
  fieldId: string | null;
};

export default function ImportWizardPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<{
    file: File;
    preview: ParsedFilePreview;
  } | null>(null);
  const [mappings, setMappings] = useState<
    Array<{
      sourceColumn: string;
      target: MappingTarget;
      sampleData: string[];
    }>
  >([]);
  const [duplicateHandling, setDuplicateHandling] = useState<
    "insert" | "update" | "upsert"
  >("insert");
  const [importOptions, setImportOptions] = useState({
    enableWorkflows: false,
    enableValidation: true,
    enableApprovals: false,
  });

  const [modules, setModules] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [loadingModules, setLoadingModules] = useState(true);
  const [loadingForms, setLoadingForms] = useState(false);
  const [loadingFormDetails, setLoadingFormDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setLoadingModules(true);
        setError(null);
        const res = await fetch("/api/modules");
        if (!res.ok) throw new Error("Failed to fetch modules");
        const data = await res.json();
        if (!data.success)
          throw new Error(data.error || "Failed to load modules");

        const flattenedModules: any[] = [];
        const processModule = (mod: any) => {
          flattenedModules.push({
            id: mod.id,
            name: mod.name,
            label: mod.name,
            fileCount: mod.forms?.length || 0,
            mappingStatus: "unmapped" as const,
          });
          mod.children?.forEach(processModule);
        };
        data.data.forEach(processModule);
        setModules(flattenedModules);
      } catch (err: any) {
        setError(err.message);
        toast({
          title: "Error",
          description: "Failed to load modules.",
          variant: "destructive",
        });
      } finally {
        setLoadingModules(false);
      }
    };
    fetchModules();
  }, [toast]);

  const handleModuleSelect = async (moduleId: string) => {
    setSelectedModuleId(moduleId);
    setSelectedFormId("");
    setSelectedForm(null);
    setForms([]);
    setLoadingForms(true);

    try {
      const res = await fetch("/api/modules");
      if (!res.ok) throw new Error("Failed to reload modules");
      const data = await res.json();

      if (!data.success) throw new Error("Invalid response");

      let moduleForms: any[] = [];
      const findForms = (mod: any): boolean => {
        if (mod.id === moduleId) {
          moduleForms = mod.forms || [];
          return true;
        }
        if (mod.children) {
          for (const child of mod.children) {
            if (findForms(child)) return true;
          }
        }
        return false;
      };
      data.data.some(findForms);
      setForms(moduleForms);

      if (moduleForms.length > 0) {
        setSelectedFormId(moduleForms[0].id);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to load forms.",
        variant: "destructive",
      });
    } finally {
      setLoadingForms(false);
    }
  };

  const fetchFormDetails = async (formId: string) => {
    setLoadingFormDetails(true);
    try {
      const res = await fetch(`/api/forms/${formId}`);
      if (!res.ok) throw new Error("Failed to fetch form");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Form not found");
      setSelectedForm(data.data);
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to load form fields.",
        variant: "destructive",
      });
      setSelectedForm(null);
    } finally {
      setLoadingFormDetails(false);
    }
  };

  useEffect(() => {
    if (selectedFormId) fetchFormDetails(selectedFormId);
    else setSelectedForm(null);
  }, [selectedFormId]);

  const steps: Step[] = [
    {
      number: 1,
      label: "Upload",
      status:
        currentStep > 1
          ? "completed"
          : currentStep === 1
          ? "current"
          : "upcoming",
    },
    {
      number: 2,
      label: "Module - File Mapping",
      status:
        currentStep > 2
          ? "completed"
          : currentStep === 2
          ? "current"
          : "upcoming",
    },
    {
      number: 3,
      label: "Section & Field Mapping",
      status:
        currentStep > 3
          ? "completed"
          : currentStep === 3
          ? "current"
          : "upcoming",
    },
    {
      number: 4,
      label: "Review",
      status:
        currentStep > 4
          ? "completed"
          : currentStep === 4
          ? "current"
          : "upcoming",
    },
    {
      number: 5,
      label: "Finish",
      status: currentStep === 5 ? "current" : "upcoming",
    },
  ];

  const normalizeKey = (str: string): string => {
    return String(str)
      .replace(/[\u2018\u2019]/g, "'")
      .trim();
  };

  const handleFileUpload = (file: File, preview: ParsedFilePreview) => {
    const normalizedHeaders = preview.headers.map((h) =>
      normalizeKey(String(h))
    );
    const normalizedPreview = { ...preview, headers: normalizedHeaders };

    const newMappings = normalizedHeaders.map((header, idx) => ({
      sourceColumn: header,
      target: { sectionId: null, fieldId: null },
      sampleData: preview.rows
        .slice(0, 3)
        .map((row) => String(row[idx] || "").trim()),
    }));

    setUploadedFile({ file, preview: normalizedPreview });
    setMappings(newMappings);
  };

  const handleMappingChange = (
    sourceColumn: string,
    target: MappingTarget
  ) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn ? { ...m, target } : m
      )
    );
  };

  const handleStartMigration = async () => {
    if (!uploadedFile || !selectedFormId) {
      return;
    }

    try {
      setCurrentStep(5);

      const jobRes = await fetch("/api/import/create-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: selectedModuleId,
          formId: selectedFormId,
          fileName: uploadedFile.file.name,
          fileSize: uploadedFile.file.size,
          duplicateHandling,
          importOptions,
        }),
      });

      const jobData = await jobRes.json();
      if (!jobData.success)
        throw new Error(jobData.error || "Failed to create job");

      const normalizedMappings = mappings
        .filter((m) => m.target.sectionId && m.target.fieldId)
        .map((m) => ({
          sourceColumn: normalizeKey(m.sourceColumn),
          sectionId: m.target.sectionId!,
          fieldId: m.target.fieldId!,
        }));

      if (normalizedMappings.length === 0) {
        throw new Error("No fields mapped. Please map at least one field.");
      }

      const saveRes = await fetch("/api/import/add-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importJobId: jobData.importJobId,
          mappings: normalizedMappings,
        }),
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || "Failed to save mappings");
      }

      const rows = uploadedFile.preview.rows.map((row) => {
        const obj: Record<string, string> = {};
        uploadedFile.preview.headers.forEach((header, i) => {
          obj[normalizeKey(header)] = String(row[i] || "").trim();
        });
        return obj;
      });

      const processRes = await fetch("/api/import/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importJobId: jobData.importJobId,
          rows,
        }),
      });

      const result = await processRes.json();
      if (!processRes.ok || !result.success) {
        throw new Error(result.error || "Import failed");
      }

      toast({
        title: "Success!",
        description: `${result.successCount} rows imported successfully!`,
      });

      setTimeout(() => (window.location.href = "/"), 2000);
    } catch (err: any) {
      toast({
        title: "Import Failed",
        description: err.message || "Something went wrong.",
        variant: "destructive",
      });
      setCurrentStep(4);
    }
  };

  const sampleData = uploadedFile
    ? uploadedFile.preview.headers.reduce((acc, header, idx) => {
        acc[normalizeKey(header)] = uploadedFile.preview.rows.map((r) =>
          String(r[idx] || "").trim()
        );
        return acc;
      }, {} as Record<string, string[]>)
    : {};

  const targetSections =
    selectedForm?.sections?.map((section: any) => ({
      id: section.id,
      label: section.title,
      order: section.order,
      fields:
        section.fields?.map((field: any) => ({
          id: field.id,
          name: field.label,
          label: field.label,
          fieldType: field.type,
          isRequired: field.validation?.required || false,
          isImportable: true,
          isExportable: true,
          isUnique: false,
          lookupDisplayFields: [],
        })) || [],
    })) || [];

  const mappedCount = mappings.filter(
    (m) => m.target.sectionId && m.target.fieldId
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <ProgressStepper steps={steps} />

      <div className="container mx-auto px-6 py-8">
        {/* Step 1 */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Your Data File</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileUpload={handleFileUpload}
                uploadedFile={uploadedFile}
                onFileRemove={() => setUploadedFile(null)}
              />
              <div className="flex justify-end mt-6">
                <Button
                  onClick={() => setCurrentStep(2)}
                  disabled={!uploadedFile}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Select Module</h2>
              <Button variant="default">Create New Module</Button>
            </div>

            {loadingModules ? (
              <p className="text-center py-12">Loading modules...</p>
            ) : error ? (
              <p className="text-red-600 text-center">{error}</p>
            ) : (
              <ModuleGrid
                modules={modules}
                onModuleClick={handleModuleSelect}
                selectedModuleId={selectedModuleId}
              />
            )}

            {selectedModuleId && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Form</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingForms ? (
                    <p className="text-center">Loading forms...</p>
                  ) : forms.length === 0 ? (
                    <p>No forms</p>
                  ) : (
                    <Select
                      value={selectedFormId}
                      onValueChange={setSelectedFormId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a form" />
                      </SelectTrigger>
                      <SelectContent>
                        {forms.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button
                onClick={() => setCurrentStep(3)}
                disabled={!selectedFormId}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 - Section & Field Mapping */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Map Sections & Fields</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Mapped: {mappedCount} / {mappings.length}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingFormDetails ? (
                  <div className="text-center py-8">Loading form structure...</div>
                ) : targetSections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No sections found in selected form
                  </div>
                ) : (
                  <FieldMappingTable
                    sourceColumns={mappings.map((m) => m.sourceColumn)}
                    targetSections={targetSections}
                    mappings={mappings}
                    onMappingChange={handleMappingChange}
                    sampleData={sampleData}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Duplicate Handling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Choose how to handle duplicates</Label>
                  <Select
                    value={duplicateHandling}
                    onValueChange={(v: any) => setDuplicateHandling(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="insert">
                        Insert only (skip duplicates)
                      </SelectItem>
                      <SelectItem value="update">
                        Update existing only
                      </SelectItem>
                      <SelectItem value="upsert">
                        Upsert (insert new + update existing)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Import Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="workflows">Enable workflows</Label>
                  <Switch
                    id="workflows"
                    checked={importOptions.enableWorkflows}
                    onCheckedChange={(c) =>
                      setImportOptions((p) => ({ ...p, enableWorkflows: c }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="validation">Enable validation rules</Label>
                  <Switch
                    id="validation"
                    checked={importOptions.enableValidation}
                    onCheckedChange={(c) =>
                      setImportOptions((p) => ({ ...p, enableValidation: c }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="approvals">Enable approval processes</Label>
                  <Switch
                    id="approvals"
                    checked={importOptions.enableApprovals}
                    onCheckedChange={(c) =>
                      setImportOptions((p) => ({ ...p, enableApprovals: c }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button onClick={() => setCurrentStep(4)}>
                Continue to Review
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="text-center p-4 bg-green-50 rounded-lg mb-6">
              <p className="text-lg font-bold text-green-800">
                Mapped Fields: {mappedCount} / {mappings.length}
              </p>
            </div>

            <ReviewSummary
              fileMappingStatus={{
                mappedFiles: uploadedFile ? 1 : 0,
                unmappedFiles: 0,
                unsupportedFiles: 0,
              }}
              moduleSummaries={[
                {
                  moduleName: selectedForm?.name || "Selected Form",
                  fileCount: uploadedFile ? 1 : 0,
                  mappedFields: mappedCount,
                  unmappedFields: mappings.length - mappedCount,
                  percentage: mappings.length
                    ? Math.round((mappedCount / mappings.length) * 100)
                    : 0,
                },
              ]}
            />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                Back
              </Button>
              <Button
                onClick={handleStartMigration}
                size="lg"
                disabled={mappedCount === 0}
              >
                Start Migration
              </Button>
            </div>
          </div>
        )}

        {/* Step 5 */}
        {currentStep === 5 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <h3 className="text-xl font-semibold mb-2">Import in Progress</h3>
              <p className="text-muted-foreground">
                Processing your data... Please wait.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}