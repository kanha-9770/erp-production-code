"use client";

import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Type,
  AlignLeft,
  Hash,
  Mail,
  Calendar,
  CheckSquare,
  Radio,
  ChevronDown,
  Upload,
  Search,
  Phone,
  Link,
  Star,
  Clock,
  MapPin,
  User,
  CreditCard,
  Image as ImageIcon,
  Layers,
  Camera,
  Mic,
  Video,
  Calculator,
  QrCode,
  MessageSquare,
  Plug,
  Heart,
  Eye,
  Target,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// FIELD TYPES DEFINITION (updated phone field)
// ──────────────────────────────────────────────────────────────────────────────
export const fieldTypes = [
  {
    id: "text",
    name: "Text Input",
    icon: Type,
    category: "Basic",
    description: "Single line text input",
  },
  {
    id: "textarea",
    name: "Text Area",
    icon: AlignLeft,
    category: "Basic",
    description: "Multi-line text input",
  },
  {
    id: "number",
    name: "Number",
    icon: Hash,
    category: "Basic",
    description: "Numeric input field",
  },
  {
    id: "email",
    name: "Email",
    icon: Mail,
    category: "Basic",
    description: "Email address input",
  },
  {
    id: "phone",
    name: "Phone Number",
    icon: Phone,
    category: "Basic",
    description: "International phone with country flag & code selector",
    renderAs: "phone-input",               // ← This tells your form renderer to use PhoneInput component
    defaultCountry: "IN",                  // Default country (India)
    preferredCountries: ["IN", "US", "GB", "AE", "CA", "AU", "DE", "FR", "SA"],
  },
  {
    id: "url",
    name: "URL",
    icon: Link,
    category: "Basic",
    description: "Website URL input",
  },
  {
    id: "date",
    name: "Date",
    icon: Calendar,
    category: "Basic",
    description: "Date picker field",
  },
  {
    id: "time",
    name: "Time",
    icon: Clock,
    category: "Basic",
    description: "Time picker field",
  },
  {
    id: "checkbox",
    name: "Checkbox",
    icon: CheckSquare,
    category: "Choice",
    description: "Single checkbox",
  },
  {
    id: "radio",
    name: "Radio Buttons",
    icon: Radio,
    category: "Choice",
    description: "Multiple choice (single select)",
  },
  {
    id: "select",
    name: "Dropdown",
    icon: ChevronDown,
    category: "Choice",
    description: "Dropdown select list",
  },
  {
    id: "file",
    name: "File Upload",
    icon: Upload,
    category: "Advanced",
    description: "Upload files",
  },
  {
    id: "lookup",
    name: "Lookup",
    icon: Search,
    category: "Advanced",
    description: "Reference data from other sources",
  },
  {
    id: "rating",
    name: "Rating",
    icon: Star,
    category: "Advanced",
    description: "Star rating input",
  },
  {
    id: "location",
    name: "Location",
    icon: MapPin,
    category: "Advanced",
    description: "Geographic location picker",
  },
  {
    id: "signature",
    name: "Signature",
    icon: User,
    category: "Advanced",
    description: "Digital signature pad",
  },
  {
    id: "payment",
    name: "Payment",
    icon: CreditCard,
    category: "Advanced",
    description: "Payment processing field",
  },
  {
    id: "image",
    name: "Image",
    icon: ImageIcon,
    category: "Media",
    description: "Image upload field",
  },
  {
    id: "camera",
    name: "Camera",
    icon: Camera,
    category: "Media",
    description: "Capture photo from device camera",
  },
  {
    id: "subform",
    name: "Subform",
    icon: Layers,
    category: "Advanced",
    description: "Nested form with fields",
  },
  {
    id: "unique-id",
    name: "Unique ID",
    icon: Hash,
    category: "Advanced",
    description: "Automatically generated unique identifier",
  },
  {
    id: "user",
    name: "User",
    icon: User,
    category: "Basic",
    description: "User selection field",
    autoFillCurrentUser: true,
  },
  {
    id: "multi-select",
    name: "Multi Select",
    icon: ChevronDown,
    category: "Choice",
    description: "Multiple selection dropdown",
  },
  {
    id: "address",
    name: "Address",
    icon: MapPin,
    category: "Basic",
    description: "Structured address with Street, City, State, Zip, Country",
    isComposite: true,                      // ← flag so renderer knows it's special
    subfields: [                            // ← define the parts (like Zoho)
      {
        key: "line1",
        label: "Street Address",
        placeholder: "Street address, house no.",
        required: true,                     // usually always shown & required
      },
      {
        key: "line2",
        label: "Address Line 2",
        placeholder: "Apartment, suite, floor",
        required: false,
      },
      {
        key: "city",
        label: "City / District",
        placeholder: "Enter City",
        required: true,
      },
      {
        key: "state",
        label: "State / Province",
        placeholder: "Enter State",
        required: true,
      },
      {
        key: "postal",
        label: "Postal / Zip Code",
        placeholder: "Enter Postal Code",
        required: true,
      },
      {
        key: "country",
        label: "Country",
        type: "select",                     // ← can be dropdown
        options: ["India", "United States", "United Kingdom", /* ... more */],
        default: "India",
        required: true,
      },
    ],
    // Optional future extensions
    features: {
      autoFillFromZip: true,               // you can implement later (Google Places / postal API)
      hideableSubfields: true,             // allow user to hide line2, etc. in settings
    }
  },
  {
    id: "name",
    name: "Name",
    icon: User,
    category: "Basic",
    description: "Name input field",
  },
  {
    id: "datetime",
    name: "Date/Time",
    icon: Clock,
    category: "Basic",
    description: "Date and time picker",
  },
  {
    id: "currency",
    name: "Currency",
    icon: CreditCard,
    category: "Basic",
    description: "Currency input field",
  },
  {
    id: "rich-text",
    name: "Rich Text",
    icon: AlignLeft,
    category: "Basic",
    description: "Rich text editor",
  },
  {
    id: "decimal",
    name: "Decimal",
    icon: Hash,
    category: "Basic",
    description: "Decimal number input",
  },
  {
    id: "percent",
    name: "Percent",
    icon: Hash,
    category: "Basic",
    description: "Percentage input field",
  },
  {
    id: "audio",
    name: "Audio",
    icon: Mic,
    category: "Media",
    description: "Audio upload field",
  },
  {
    id: "long-integer",
    name: "Long Integer",
    icon: Hash,
    category: "Basic",
    description: "Long integer input",
  },
  {
    id: "video",
    name: "Video",
    icon: Video,
    category: "Media",
    description: "Video upload field",
  },
  {
    id: "formula",
    name: "Formula",
    icon: Calculator,
    category: "Advanced",
    description: "Calculated formula field",
  },
  {
    id: "rollup",
    name: "Rollup Summary",
    icon: Layers,
    category: "Advanced",
    description: "Summary of related records",
  },
  {
    id: "auto-number",
    name: "Auto Number",
    icon: Hash,
    category: "Advanced",
    description: "Automatically generated number",
  },
  {
    id: "decision",
    name: "Decision Box",
    icon: CheckSquare,
    category: "Advanced",
    description: "Decision-making input",
  },
  {
    id: "qr",
    name: "QR/Barcode",
    icon: QrCode,
    category: "Advanced",
    description: "QR or barcode scanner",
  },
  {
    id: "notes",
    name: "Add Notes",
    icon: MessageSquare,
    category: "Advanced",
    description: "Notes attachment field",
  },
  {
    id: "integration",
    name: "Integration",
    icon: Plug,
    category: "Advanced",
    description: "External integration field",
  },
  {
    id: "prediction",
    name: "Prediction",
    icon: Target,
    category: "AI",
    description: "AI-powered prediction",
  },
  {
    id: "keyboard-extraction",
    name: "Keyboard Extraction",
    icon: Type,
    category: "AI",
    description: "Extract data from keyboard input",
  },
  {
    id: "sentiment",
    name: "Sentiment Analysis",
    icon: Heart,
    category: "AI",
    description: "Analyze text sentiment",
  },
  {
    id: "ocr",
    name: "OCR",
    icon: Eye,
    category: "AI",
    description: "Optical character recognition",
  },
  {
    id: "object-detection",
    name: "Object Detection",
    icon: Target,
    category: "AI",
    description: "Detect objects in images/videos",
  },
  {
    id: "new-section",
    name: "New Section",
    icon: Layers,
    category: "Other",
    description: "Add a new form section",
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// PALETTE ITEM COMPONENT
// ──────────────────────────────────────────────────────────────────────────────
interface PaletteItemProps {
  fieldType: (typeof fieldTypes)[0];
}

function PaletteItem({ fieldType }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: fieldType.id,
      data: {
        type: "PaletteField",
        isPaletteItem: true,
        fieldType: fieldType.id,
        fieldData: fieldType,
      },
    });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 9999 : 1,
  };

  const IconComponent = fieldType.icon;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab hover:cursor-grabbing transition-all duration-200 hover:shadow-md hover:scale-105 border border-gray-100 ${isDragging
        ? "shadow-2xl scale-110 rotate-3 border-blue-400 bg-blue-50"
        : "hover:border-blue-300"
        }`}
    >
      <CardContent className="px-2 py-1">
        <div className="flex items-center space-x-2">
          <div className="flex-shrink-0">
            <IconComponent className="w-3 h-3 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.8rem] font-medium text-gray-900 truncate">
              {fieldType.name}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DRAG OVERLAY (shown while dragging)
// ──────────────────────────────────────────────────────────────────────────────
export function PaletteItemDragOverlay({
  fieldType,
}: {
  fieldType: (typeof fieldTypes)[0];
}) {
  const IconComponent = fieldType.icon;
  return (
    <Card className="palette-item-drag-overlay border-2 border-blue-500 shadow-2xl bg-blue-50 rotate-6 scale-110 z-[9999]">
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg">
            <IconComponent className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-blue-900">{fieldType.name}</p>
            <p className="text-sm text-blue-700">{fieldType.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN PALETTE COMPONENT
// ──────────────────────────────────────────────────────────────────────────────
export default function FieldPalette() {
  const categories = Array.from(new Set(fieldTypes.map((ft) => ft.category)));

  return (
    <div className="h-screen flex flex-col bg-white border-r border-gray-200">
      {/* Fixed Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-10">
        <h2 className="text-lg font-bold text-gray-900">Field Palette</h2>
      </div>

      {/* Scrollable Content Only */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {categories.map((category) => (
          <div key={category} className="space-y-3">
            {/* Category Title */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {category}
              </h3>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                {fieldTypes.filter((ft) => ft.category === category).length}
              </Badge>
            </div>

            {/* Grid of Fields */}
            <div className="grid grid-cols-2 gap-2">
              {fieldTypes
                .filter((ft) => ft.category === category)
                .map((fieldType) => (
                  <PaletteItem key={fieldType.id} fieldType={fieldType} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}