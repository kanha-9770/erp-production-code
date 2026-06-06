import { redirect } from "next/navigation";

export default function AccountsIndex() {
  redirect("/accounts/payment-request");
}
