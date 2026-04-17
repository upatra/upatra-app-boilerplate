import { Box, Icon, InlineStack, Text } from "@shopify/polaris";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import CopyEmailLink from "./CopyEmailLink";

export const SUPPORT_EMAIL = "steve@upatra.com";

export default function Footer() {
  return (
    <Box paddingBlock="400" paddingInline="400">
      <InlineStack align="center">
        <InlineStack gap="100" blockAlign="center">
          <Icon source={QuestionCircleIcon} tone="subdued" />
          <Text as="p" tone="subdued" variant="bodySm">
            Got any trouble or have recommendations? Mail us at{" "}
            <CopyEmailLink email={SUPPORT_EMAIL} />
          </Text>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}
