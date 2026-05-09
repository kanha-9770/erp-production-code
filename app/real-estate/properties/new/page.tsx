"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useCreatePropertyMutation } from "@/lib/api/real-estate/properties";
import { PropertyForm } from "@/components/real-estate/property-form";

export default function NewPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [createProperty, { isLoading }] = useCreatePropertyMutation();

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate/properties" aria-label="Back to properties">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            New property listing
          </h1>
          <p className="text-sm text-muted-foreground">
            Capture the basics now — you can add images & documents after saving.
          </p>
        </div>
      </div>

      <PropertyForm
        submitLabel="Create listing"
        submitting={isLoading}
        onCancel={() => router.push("/real-estate/properties")}
        onSubmit={async (payload) => {
          try {
            const res = await createProperty(payload).unwrap();
            toast({ title: "Listing created" });
            router.push(`/real-estate/properties/${res.data.id}`);
          } catch (e: any) {
            toast({
              title: "Could not create listing",
              description: e?.data?.error || e?.message || "Server rejected the request",
              variant: "destructive",
            });
          }
        }}
      />
    </div>
  );
}
