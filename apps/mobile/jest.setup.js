/**
 * Native modules the tests never exercise are stubbed here.
 *
 * SecureStore is mocked with an in-memory map rather than a no-op so the
 * session tests can prove a token actually round-trips.
 */

/* eslint-env jest */

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('expo-device', () => ({ isDevice: false }));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
  addEventListener: jest.fn(() => () => undefined),
}));

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

/**
 * Safe-area insets.
 *
 * `useSafeAreaInsets` throws outside a `SafeAreaProvider`, which every test
 * rendering a Sheet or the tab bar would otherwise have to wrap for. The values
 * are a plausible Android device rather than zeroes, so a component that forgets
 * the inset still looks wrong in a snapshot.
 */
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 24, bottom: 16, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => React.createElement(require('react-native').View, null, children),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 400, height: 800 }),
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 400, height: 800 } },
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hideAsync: jest.fn(async () => undefined),
}));

global.fetch = jest.fn();

/**
 * Reanimated, for the test renderer.
 *
 * Reanimated 4 reaches for its native worklets module the moment it is
 * imported, and the mock it ships re-imports the real entry point — so neither
 * the library nor its own mock survives jest-expo. This stub provides the
 * surface the design system uses and nothing else: components render, styles
 * resolve to plain objects, and animations resolve instantly to their target
 * value, which is what a test wants to assert against anyway.
 */
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView, FlatList } = require('react-native');

  // Layout animations are declarative descriptors; under test they only need
  // to be chainable and inert.
  const descriptor = () => {
    const self = {};
    for (const key of ['duration', 'delay', 'springify', 'damping', 'stiffness', 'easing', 'withInitialValues', 'build']) {
      self[key] = () => self;
    }
    return self;
  };
  const layout = new Proxy({}, { get: () => descriptor() });

  const passthrough = (component) =>
    React.forwardRef((props, ref) => {
      // `entering`, `exiting` and `layout` are Reanimated-only props; passing
      // them to a host component makes React warn.
      const { entering, exiting, layout: _layout, ...rest } = props;
      return React.createElement(component, { ...rest, ref });
    });

  const Animated = {
    View: passthrough(View),
    Text: passthrough(Text),
    ScrollView: passthrough(ScrollView),
    FlatList: passthrough(FlatList),
    createAnimatedComponent: passthrough,
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (fn) => fn(),
    useAnimatedProps: (fn) => fn(),
    useDerivedValue: (fn) => ({ value: fn() }),
    useAnimatedScrollHandler: () => () => undefined,
    // Animations resolve to their destination immediately.
    withTiming: (to) => to,
    withSpring: (to) => to,
    withDelay: (_, animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    cancelAnimation: jest.fn(),
    withRepeat: (animation) => animation,
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    interpolate: (value, input, output) => output?.[0] ?? value,
    interpolateColor: (_value, _input, output) => output?.[0],
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: new Proxy({}, { get: () => () => undefined }),
    FadeIn: descriptor(),
    FadeOut: descriptor(),
    FadeInDown: descriptor(),
    FadeInUp: descriptor(),
    LinearTransition: descriptor(),
    Layout: descriptor(),
    ...layout,
  };
});
