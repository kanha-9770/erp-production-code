"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
  fmtMoney,
} from "@/components/workspace/detail-shell";
import {
  Tag,
  User,
  CreditCard,
  Info,
  Smartphone,
  Briefcase,
  Calendar,
  Laptop,
  Smartphone as SimIcon,
  Monitor,
  Headphones,
  HardDrive,
  Computer,
  Tablet,
  Keyboard,
  Mouse,
  Printer,
  Camera,
  Car,
  Armchair,
  IdCard,
} from "lucide-react";

const STORAGE_KEY = "asset-management:v3";
const BACK = "/asset-management";

interface Asset {
  id: string;
  name: string;
  type: string;
  status: string;
  purchaseDate: string;
  value: number;
  notes: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  assignedTo?: string;
  serialNo: string;
  assetModel?: string;
  configuration?: string;
  countryCode?: string;
  simNumber?: string;
  imsiNumber?: string;
  imei?: string;
  carrier?: string;
  simType?: string;
  planType?: string;
  simIssueBy?: string;
  simLocation?: string;
  simStatus?: string;
  plan?: string;
  rechargeDate?: string;
  rechargeAmount?: number;
  monthlyCost?: number;
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  LAPTOP: "Laptop",
  DESKTOP: "Desktop",
  MOBILE_PHONE: "Mobile Phone",
  TABLET: "Tablet",
  MONITOR: "Monitor",
  HEADPHONE: "Headphone",
  KEYBOARD: "Keyboard",
  MOUSE: "Mouse",
  PRINTER: "Printer",
  CAMERA: "Camera",
  VEHICLE: "Vehicle",
  FURNITURE: "Furniture",
  ID_CARD: "ID Card",
  SIM: "SIM card",
  OTHER: "Other",
  PHONE: "Phone (legacy)",
  ACCESSORY: "Accessory (legacy)",
};

const ASSET_TYPE_ICON: Record<string, any> = {
  LAPTOP: Laptop,
  DESKTOP: Computer,
  MOBILE_PHONE: Smartphone,
  TABLET: Tablet,
  MONITOR: Monitor,
  HEADPHONE: Headphones,
  KEYBOARD: Keyboard,
  MOUSE: Mouse,
  PRINTER: Printer,
  CAMERA: Camera,
  VEHICLE: Car,
  FURNITURE: Armchair,
  ID_CARD: IdCard,
  SIM: SimIcon,
  OTHER: HardDrive,
  PHONE: Smartphone,
  ACCESSORY: Headphones,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  ASSIGNED: "secondary",
  UNDER_REPAIR: "outline",
  RETIRED: "destructive",
};

function displayName(a: Asset) {
  if (a.name?.trim()) return a.name.trim();
  if (a.type === "SIM") {
    const last4 = (a.simNumber ?? "").replace(/\D/g, "").slice(-4);
    return a.carrier ? `SIM · ${a.carrier} · ●●●● ${last4}` : `SIM · ●●●● ${last4}`;
  }
  return ASSET_TYPE_LABEL[a.type] ?? a.type;
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items: Asset[] = raw ? JSON.parse(raw) : [];
      setAsset(items.find((a) => a.id === id) ?? null);
    } catch {
      setAsset(null);
    }
    setLoading(false);
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!asset) return <DetailNotFound backHref={BACK} />;

  const Icon = ASSET_TYPE_ICON[asset.type] ?? HardDrive;
  const isSim = asset.type === "SIM";
  const assignee =
    asset.assignedTo ||
    (asset.firstName || asset.lastName
      ? `${asset.firstName ?? ""} ${asset.lastName ?? ""}`.trim()
      : null);

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Asset Management"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          {displayName(asset)}
          <Badge variant={STATUS_VARIANT[asset.status]} className="text-[10px]">
            {asset.status.replace("_", " ")}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {ASSET_TYPE_LABEL[asset.type] ?? asset.type}
          </Badge>
        </span>
      }
      subtitle={
        <span className="font-mono">{asset.id}</span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Asset" icon={<Tag className="h-3.5 w-3.5" />}>
          <DetailFact label="Asset ID" value={asset.id} mono />
          <DetailFact label="Name" value={asset.name} />
          <DetailFact label="Type" value={ASSET_TYPE_LABEL[asset.type] ?? asset.type} />
          <DetailFact label="Status" value={asset.status.replace("_", " ")} />
          <DetailFact label="Purchase date" value={fmtDate(asset.purchaseDate)} />
          <DetailFact
            label={isSim ? "Monthly cost" : "Purchase value"}
            value={fmtMoney(isSim ? asset.monthlyCost : asset.value)}
            mono
          />
        </DetailSection>

        <DetailSection title="Assignment" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Assigned to" value={assignee} />
          <DetailFact label="Employee ID" value={asset.employeeId} mono />
          <DetailFact label="First name" value={asset.firstName} />
          <DetailFact label="Last name" value={asset.lastName} />
          <DetailFact label="Department" value={asset.department} />
        </DetailSection>

        {!isSim ? (
          <DetailSection
            title="Technical Specifications"
            icon={<Briefcase className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <DetailFact label="Serial number" value={asset.serialNo} mono />
            <DetailFact label="Asset model" value={asset.assetModel} />
            <DetailFact label="Configuration" value={asset.configuration} wide />
          </DetailSection>
        ) : (
          <DetailSection
            title="SIM Details"
            icon={<Smartphone className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <DetailFact
              label="Mobile number"
              value={
                asset.simNumber ? `${asset.countryCode ?? ""} ${asset.simNumber}`.trim() : null
              }
              mono
            />
            <DetailFact label="IMSI" value={asset.imsiNumber} mono />
            <DetailFact label="IMEI" value={asset.imei} mono />
            <DetailFact label="Service provider" value={asset.carrier} />
            <DetailFact label="SIM type" value={asset.simType} />
            <DetailFact label="Plan type" value={asset.planType} />
            <DetailFact label="Plan category" value={asset.plan} />
            <DetailFact label="SIM status" value={asset.simStatus} />
            <DetailFact label="Issued by" value={asset.simIssueBy} />
            <DetailFact label="Location" value={asset.simLocation} />
          </DetailSection>
        )}

        {isSim ? (
          <DetailSection
            title="Billing"
            icon={<CreditCard className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <DetailFact label="Last recharge" value={fmtDate(asset.rechargeDate)} />
            <DetailFact label="Recharge amount" value={fmtMoney(asset.rechargeAmount)} mono />
            <DetailFact label="Monthly cost" value={fmtMoney(asset.monthlyCost)} mono />
          </DetailSection>
        ) : null}

        <DetailSection
          title="Notes"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact
            label="Asset notes"
            value={asset.notes || "No special notes recorded for this asset."}
            wide
          />
        </DetailSection>

        <DetailSection
          title="Record"
          icon={<Calendar className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Asset ID" value={asset.id} mono />
          <DetailFact label="Purchase date" value={fmtDate(asset.purchaseDate)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
