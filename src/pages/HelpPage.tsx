import {
  Badge,
  BlockStack,
  Box,
  Card,
  Divider,
  InlineStack,
  Layout,
  Link,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import CopyEmailLink from "../components/CopyEmailLink";

interface ArticleSection {
  heading: string;
  body?: string;
  bullets?: string[];
}

interface Article {
  id: string;
  title: string;
  tag?: string;
  summary: string;
  sections: ArticleSection[];
}

// Replace this array with the help content for your app. Each article renders
// as a card on the right column with a clickable entry in the table of contents.
const ARTICLES: Article[] = [
  {
    id: "getting-started",
    title: "Getting started",
    tag: "Overview",
    summary: "A short introduction to what this app does and how to use it.",
    sections: [
      {
        heading: "What this app does",
        body: "Describe your app's primary value here so merchants understand the workflow before diving in.",
      },
      {
        heading: "First steps",
        bullets: [
          "Connect your store from the Settings page",
          "Configure default options",
          "Run your first action and review the results",
        ],
      },
    ],
  },
];

const SUPPORT_EMAIL = ""; // set to a support address to surface it in the TOC card

function ArticleCard({ article }: { article: Article }) {
  return (
    <div id={article.id}>
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text as="h2" variant="headingLg">
                {article.title}
              </Text>
              {article.tag && <Badge tone="info">{article.tag}</Badge>}
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              {article.summary}
            </Text>
          </BlockStack>

          <Divider />

          <BlockStack gap="400">
            {article.sections.map((section) => (
              <BlockStack key={section.heading} gap="200">
                <Text as="h3" variant="headingSm">
                  {section.heading}
                </Text>
                {section.body && (
                  <Text as="p" variant="bodyMd">
                    {section.body}
                  </Text>
                )}
                {section.bullets && (
                  <List type="bullet">
                    {section.bullets.map((b) => (
                      <List.Item key={b}>{b}</List.Item>
                    ))}
                  </List>
                )}
              </BlockStack>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>
    </div>
  );
}

function TableOfContents() {
  const handleClick = (id: string) => () => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">
          Contents
        </Text>
        <BlockStack gap="150">
          {ARTICLES.map((a) => (
            <Link key={a.id} onClick={handleClick(a.id)} removeUnderline>
              {a.title}
            </Link>
          ))}
        </BlockStack>
        {SUPPORT_EMAIL && (
          <>
            <Divider />
            <Text as="p" variant="bodySm" tone="subdued">
              Still stuck? Email <CopyEmailLink email={SUPPORT_EMAIL} />.
            </Text>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

export default function HelpPage() {
  return (
    <Page title="Help & Guides" subtitle="Learn how each feature works.">
      <Layout>
        <Layout.Section variant="oneThird">
          <Box paddingBlockEnd="400">
            <TableOfContents />
          </Box>
        </Layout.Section>
        <Layout.Section>
          <BlockStack gap="400">
            {ARTICLES.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
