"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Building2 } from "lucide-react"

const CreateOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
})

type CreateOrganizationFormData = z.infer<typeof CreateOrganizationSchema>

interface CreateOrganizationModalProps {
  open: boolean
  onSuccess: () => void
}

export function CreateOrganizationModal({ open, onSuccess }: CreateOrganizationModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const form = useForm<CreateOrganizationFormData>({
    resolver: zodResolver(CreateOrganizationSchema),
    defaultValues: {
      name: "",
    },
  })

  const onSubmit = async (data: CreateOrganizationFormData) => {
    setIsLoading(true)

    try {
      const response = await fetch("/api/organizations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: "Failed to Create Organization",
          description: result.error || "Something went wrong",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success!",
        description: "Your organization has been created successfully",
      })

      onSuccess()
    } catch (error) {
      toast({
        title: "Error",
        description: "Network error. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-blue-600 rounded-full mb-4">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-2xl text-center">Create Your Organization</DialogTitle>
          <DialogDescription className="text-center">
            Set up your organization to get started. You'll be the administrator.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Organization Name *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="Enter your organization name"
                      className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating organization...</span>
                </div>
              ) : (
                "Create Organization"
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
