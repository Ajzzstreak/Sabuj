import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Page, Screen, StackHeader } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Banner } from '@/components/ui';
import { LEGAL_COPY_IS_FINAL, LEGAL_DOCS, type LegalDocId } from '@/content/legal';
import { space } from '@/theme';

/** Privacy policy, Terms, How we rank, Data we collect. Copy lives in src/content/legal.ts. */
export default function LegalScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const id = (Array.isArray(params.doc) ? params.doc[0] : params.doc) ?? '';
  const doc = id in LEGAL_DOCS ? LEGAL_DOCS[id as LegalDocId] : null;
  if (!doc) return <Redirect href="/profile" />;
  return (
    <Screen>
      <StackHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Page style={styles.page}>
          <Text variant="title1" accessibilityRole="header">
            {doc.title}
          </Text>
          <Text variant="body" tone="textSecondary" style={styles.summary}>
            {doc.summary}
          </Text>
          {LEGAL_COPY_IS_FINAL ? null : (
            <Banner
              testID="draft-banner"
              tone="notice"
              icon="construct-outline"
              title="DRAFT — placeholder text"
              text="This page is a template. Nothing here is final or legally reviewed; the owner must replace it before release."
              style={styles.banner}
            />
          )}
          {doc.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text variant="title3" accessibilityRole="header">
                {section.heading}
              </Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph} variant="body" tone="textSecondary" style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </Page>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl + space.lg },
  page: { maxWidth: 760 },
  summary: { marginTop: 6 },
  banner: { marginTop: space.lg },
  section: { marginTop: space.xxl },
  paragraph: { marginTop: space.sm },
});
