"use client";

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetPropertyQuery,
  useUpdatePropertyMutation,
} from "@/lib/api/real-estate/properties";
import { PropertyForm } from "@/components/real-estate/property-form";

export default function EditPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading } = useGetPropertyQuery(id);
  const [updateProperty, { isLoading: saving }] = useUpdatePropertyMutation();

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/real-estate/properties/${id}`} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Edit listing
          </h1>
          <p className="text-sm text-muted-foreground">
            Changes to listing price are recorded in the price history.
          </p>
        </div>
      </div>

      {isLoading || !data?.data ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <PropertyForm
          initial={data.data}
          submitLabel="Save changes"
          submitting={saving}
          onCancel={() => router.push(`/real-estate/properties/${id}`)}
          onSubmit={async (payload) => {
            try {
              await updateProperty({ id, body: payload }).unwrap();
              toast({ title: "Listing updated" });
              router.push(`/real-estate/properties/${id}`);
            } catch (e: any) {
              toast({
                title: "Could not save changes",
                description: e?.data?.error || e?.message,
                variant: "destructive",
              });
            }
          }}
        />
      )}
    </div>
  );
}
