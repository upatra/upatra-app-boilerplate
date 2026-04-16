import { Box, Icon, InlineStack, Text } from "@shopify/polaris";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import CopyEmailLink from "./CopyEmailLink";

interface Props {
  supportEmail?: string;
}

export default function Footer({ supportEmail }: Props) {
  if (!supportEmail) return null;
  return (
    <Box paddingBlock="400" paddingInline="400">
      <InlineStack align="center">
        <InlineStack gap="100" blockAlign="center">
          <Icon source={QuestionCircleIcon} tone="subdued" />
          <Text as="p" tone="subdued" variant="bodySm">
            Got any trouble or have recommendations? Mail us at{" "}
            <CopyEmailLink email={supportEmail} />
          </Text>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}
