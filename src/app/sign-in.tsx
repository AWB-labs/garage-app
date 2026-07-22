import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { IgnitionHero } from '@/components/signature/IgnitionHero';
import { AppText, Button, Icon, PressableScale, Screen } from '@/components/ui';
import { useAuthStore } from '@/stores/auth';
import { fonts, radius, space, springs, useMotion, useTheme } from '@/theme';

type Mode = 'signIn' | 'signUp';

/**
 * The only screen a signed out person can reach. Email and password, because
 * Garage must keep running inside Expo Go and the native Google and Apple
 * sign in modules cannot.
 *
 * The car standing in the dark with its headlights coming up is the whole
 * screen's argument: this is a garage, and the light is being switched on.
 */
export default function SignInScreen() {
  const { colors } = useTheme();
  const { reduced, stagger, fadeDuration } = useMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const busy = useAuthStore((s) => s.busy);

  const [mode, setMode] = React.useState<Mode>('signIn');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const passwordRef = React.useRef<TextInput>(null);

  // Entrance choreography, the same helper every other screen uses: springs,
  // overshoot clamped, staggered per element group, once per mount.
  const enter = (index: number) =>
    reduced
      ? FadeIn.duration(fadeDuration).reduceMotion(ReduceMotion.Never)
      : FadeInDown.springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness)
          .overshootClamping(1)
          .delay(stagger(index));

  // Short phones give the light less room rather than pushing the password
  // field under the keyboard.
  const heroHeight = Math.max(120, Math.min(windowHeight * 0.23, 190));

  const submit = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Enter your email and a password.');
      return;
    }
    const auth = useAuthStore.getState();
    const result =
      mode === 'signIn' ? await auth.signIn(trimmed, password) : await auth.signUp(trimmed, password);

    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    // A successful sign in swaps this screen out from under us, so there is
    // nothing to do on that path.
    if (result.needsConfirmation) setSentTo(trimmed);
  };

  const swap = () => {
    setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
    setError(null);
  };

  // The hero is full bleed, so it cancels the Screen gutter rather than
  // stopping short of the edge the beam runs off.
  const heroBleed = { marginHorizontal: -space.lg };

  if (sentTo) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.View entering={enter(0)} style={heroBleed}>
            <IgnitionHero width={windowWidth} height={heroHeight} />
          </Animated.View>
          <Animated.View entering={enter(1)} style={{ gap: space.lg, marginTop: space.xl2 }}>
            <Icon name="check" size={32} color={colors.successText} strokeWidth={1.8} />
            <AppText variant="displayL">Check your inbox</AppText>
            <AppText variant="body" color="textSecondary">
              We sent a confirmation link to {sentTo}. Open it, then come back and sign in.
            </AppText>
            <Button
              label="Back to sign in"
              variant="ghost"
              full
              onPress={() => {
                setSentTo(null);
                setMode('signIn');
                setPassword('');
              }}
            />
          </Animated.View>
        </View>
      </Screen>
    );
  }

  const title = mode === 'signIn' ? 'Sign in' : 'Create account';

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: space.xl2 }}
        >
          <Animated.View entering={enter(0)} style={heroBleed}>
            <IgnitionHero width={windowWidth} height={heroHeight} busy={busy} />
          </Animated.View>

          <Animated.View entering={enter(1)} style={{ marginTop: space.xl }}>
            <AppText variant="label" color="textMuted">
              Garage
            </AppText>
            <AppText variant="displayXL" style={{ marginTop: space.xs }}>
              {title}
            </AppText>
            <AppText variant="small" color="textSecondary" style={{ marginTop: space.sm }}>
              Your cars, their service history, and anyone you share them with, on every phone you sign in
              on.
            </AppText>
          </Animated.View>

          <Animated.View entering={enter(2)} style={{ marginTop: space.xl2, gap: space.md }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              inputRef={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'signUp' ? 'At least 6 characters' : 'Your password'}
              secureTextEntry
              textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          </Animated.View>

          {error ? (
            <Animated.View
              entering={FadeIn.duration(fadeDuration).reduceMotion(ReduceMotion.Never)}
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md, alignItems: 'flex-start' }}
            >
              <Icon name="alert" size={16} color={colors.dangerText} strokeWidth={1.8} />
              <AppText variant="small" color="dangerText" style={{ flex: 1 }}>
                {error}
              </AppText>
            </Animated.View>
          ) : null}

          <Animated.View entering={enter(3)} style={{ marginTop: space.xl, gap: space.md }}>
            <Button label={title} onPress={() => void submit()} loading={busy} full />
            <PressableScale
              accessibilityLabel={mode === 'signIn' ? 'Create an account instead' : 'Sign in instead'}
              onPress={swap}
              style={{ paddingVertical: space.sm, alignItems: 'center' }}
            >
              <AppText variant="small" color="accentText">
                {mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              </AppText>
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  textContentType?: 'emailAddress' | 'password' | 'newPassword';
  autoComplete?: 'email' | 'password' | 'new-password' | 'current-password';
  returnKeyType?: 'next' | 'go';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
}

function Field({ label, value, onChangeText, inputRef, ...input }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="label" color={focused ? 'accentText' : 'textMuted'}>
        {label}
      </AppText>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: 48,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: focused ? colors.accentText : colors.stroke,
          backgroundColor: colors.inset,
          paddingHorizontal: space.md,
          fontFamily: fonts.body,
          fontSize: 16,
          color: colors.text,
        }}
        {...input}
      />
    </View>
  );
}
