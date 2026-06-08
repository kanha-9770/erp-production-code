"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  Building2,
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  Boxes,
  Package,
  Banknote,
  ShoppingCart,
} from "lucide-react"
import { useCreateOrganizationMutation } from "@/lib/api/organization"
import { ERP_MODULES, DEFAULT_NEW_ORG_MODULES, type ErpModuleDef } from "@/lib/erp-modules"
import { cn } from "@/lib/utils"

const CreateOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
})

type CreateOrganizationFormData = z.infer<typeof CreateOrganizationSchema>

interface CreateOrganizationModalProps {
  open: boolean
  onSuccess: () => void
}

type Step = "name" | "modules"

// Resolve a Lucide icon for the module's `icon` string. Kept local to the
// modal so the catalog file in `lib/erp-modules.ts` stays server-safe.
function moduleIcon(name: string) {
  switch (name) {
    case "users":
      return Users
    case "building2":
      return Building2
    case "boxes":
      return Boxes
    case "package":
      return Package
    case "banknote":
      return Banknote
    case "shopping-cart":
      return ShoppingCart
    default:
      return Building2
  }
}

export function CreateOrganizationModal({ open, onSuccess }: CreateOrganizationModalProps) {
  const { toast } = useToast()
  const [createOrganization, { isLoading }] = useCreateOrganizationMutation()

  const [step, setStep] = useState<Step>("name")
  const [selectedModules, setSelectedModules] = useState<string[]>(() => {
    // Pre-tick the modules flagged "recommended" in the catalog so a user
    // who just clicks through still ends up with a sensible default org.
    const recs = ERP_MODULES.filter((m) => m.recommended).map((m) => m.id)
    return recs.length ? recs : [...DEFAULT_NEW_ORG_MODULES]
  })

  const form = useForm<CreateOrganizationFormData>({
    resolver: zodResolver(CreateOrganizationSchema),
    defaultValues: { name: "" },
  })

  const orgName = form.watch("name")

  const toggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  const goToModuleStep = (data: CreateOrganizationFormData) => {
    // Just stash the name in the form state and advance; the actual
    // POST happens once modules are confirmed.
    setStep("modules")
  }

  const submitOrg = async () => {
    try {
      const result = await createOrganization({
        name: orgName,
        selectedModules,
      } as any).unwrap()

      if (!result.success) {
        toast({
          title: "Failed to Create Organization",
          description: "Something went wrong",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success!",
        description: "Your organization has been created successfully",
      })

      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.error || "Network error. Please try again.",
        variant: "destructive",
      })
    }
  }

  const canContinue = selectedModules.length > 0

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-blue-600 rounded-full mb-4">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-2xl text-center">
            {step === "name" ? "Create Your Organization" : "Pick your modules"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === "name"
              ? "Set up your organization to get started. You'll be the administrator."
              : `Choose which modules ${orgName || "your org"} will use. You can change this later in Settings.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 -mt-2 mb-2">
          <StepDot active={step === "name"} done={step === "modules"} />
          <div className="h-px w-8 bg-slate-200" />
          <StepDot active={step === "modules"} done={false} />
        </div>

        {step === "name" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(goToModuleStep)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Organization Name *
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="Enter your organization name"
                        className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        disabled={isLoading}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={isLoading}
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          </Form>
        )}

        {step === "modules" && (
          <div className="space-y-5">
            <div className="grid gap-2.5">
              {ERP_MODULES.map((m) => (
                <ModuleCard
                  key={m.id}
                  module={m}
                  selected={selectedModules.includes(m.id)}
                  onToggle={() => toggleModule(m.id)}
                  disabled={isLoading}
                />
              ))}
            </div>

            {!canContinue && (
              <p className="text-center text-xs text-amber-600">
                Pick at least one module to continue.
              </p>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setStep("name")}
                disabled={isLoading}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={isLoading || !canContinue}
                onClick={submitOrg}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    Create organization
                    <Check className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full transition-colors",
        done ? "bg-blue-600" : active ? "bg-blue-600" : "bg-slate-200"
      )}
    />
  )
}

function ModuleCard({
  module: m,
  selected,
  onToggle,
  disabled,
}: {
  module: ErpModuleDef
  selected: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const Icon = moduleIcon(m.icon)
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
        "hover:border-blue-300 hover:bg-blue-50/40",
        selected
          ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/30"
          : "border-slate-200 bg-white",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors",
          selected
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-600"
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{m.label}</span>
          {m.recommended && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-500 mt-0.5 leading-snug">
          {m.description}
        </span>
      </span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors mt-0.5",
          selected
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-slate-300 bg-white"
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  )
}
