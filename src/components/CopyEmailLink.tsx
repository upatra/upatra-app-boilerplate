import { Link } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

interface Props {
  email: string;
}

export default function CopyEmailLink({ email }: Props) {
  const shopify = useAppBridge();

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(email);
      shopify?.toast?.show("Email copied to clipboard");
    } catch {
      shopify?.toast?.show("Could not copy email", { isError: true });
    }
  };

  return <Link onClick={handleClick}>{email}</Link>;
}
