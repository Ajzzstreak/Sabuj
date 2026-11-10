import { Tabs } from 'expo-router/js-tabs';
import { TabBar, WIDE_TAB_BAR_MIN } from '@/components/TabBar';
import { APP_NAME } from '@/config';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  const { width } = useLayout();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: width >= WIDE_TAB_BAR_MIN ? 'top' : 'bottom',
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: APP_NAME }} />
      <Tabs.Screen name="saved" options={{ title: `Saved · ${APP_NAME}` }} />
      <Tabs.Screen name="profile" options={{ title: `Your profile · ${APP_NAME}` }} />
    </Tabs>
  );
}
