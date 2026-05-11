import { Box, BlockStack, InlineStack, Icon, Text } from "@shopify/polaris";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import CopyEmailLink from "./CopyEmailLink";
import { env } from "../config/env";

export default function Footer() {
  return (
    <Box paddingBlock="400" paddingInline="400">
      <BlockStack gap="100" inlineAlign="center">
        <InlineStack gap="100" blockAlign="center">
          <Icon source={QuestionCircleIcon} tone="subdued" />
          <Text as="p" tone="subdued" variant="bodySm">
            Got any trouble or have recommendations? Mail us at{" "}
            <CopyEmailLink email={env.supportEmail} />
          </Text>
        </InlineStack>
        {env.supportHint ? (
          <Text as="p" tone="subdued" variant="bodySm" alignment="center">
            {env.supportHint}
          </Text>
        ) : null}
      </BlockStack>
    </Box>
  );
}
