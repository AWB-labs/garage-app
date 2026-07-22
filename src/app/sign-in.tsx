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
import { fonts, haptic, radius, space, springs, useMotion, useTheme } from '@/theme';

type Mode = 'signIn' | 'signUp';

/**
 * Length of the confirmation code, matching the project's Auth OTP length
 * setting. Verified against the live project, which issues eight digits, not
 * the six the docs lead you to expect.
 *
 * Only the auto-submit depends on this being exact. The Confirm button unlocks
 * from CODE_MIN, so if the dashboard setting ever changes underneath us the
 * screen asks for one more tap rather than becoming impossible to finish.
 */
const CODE_LENGTH = 8;
const CODE_MIN = 6;
const CODE_MAX = 10;

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
  const [code, setCode] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);

  const passwordRef = React.useRef<TextInput>(null);
  // The code submits itself on the sixth digit, so this stops a re-render or a
  // fast paste from firing the same verification twice.
  const verifying = React.useRef(false);

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

  const verify = React.useCallback(
    async (value: string) => {
      if (!sentTo || verifying.current) return;
      verifying.current = true;
      setError(null);
      setNotice(null);
      const result = await useAuthStore.getState().verifyCode(sentTo, value);
      verifying.current = false;
      if (!result.ok) {
        setError(result.error ?? 'Could not confirm that code.');
        return;
      }
      // A confirmed account is a signed in account, so the route gate takes
      // the screen away from under us. Nothing to navigate.
      haptic.save();
    },
    [sentTo]
  );

  const onCodeChange = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(0, CODE_MAX);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  const resend = async () => {
    if (!sentTo) return;
    setError(null);
    setNotice(null);
    const result = await useAuthStore.getState().resendCode(sentTo);
    if (!result.ok) {
      setError(result.error ?? 'Could not send another code.');
      return;
    }
    setCode('');
    setNotice('New code sent.');
  };

  // The hero is full bleed, so it cancels the Screen gutter rather than
  // stopping short of the edge the beam runs off.
  const heroBleed = { marginHorizontal: -space.lg };

  if (sentTo) {
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
                Confirm your email
              </AppText>
              <AppText variant="small" color="textSecondary" style={{ marginTop: space.sm }}>
                We sent a code to {sentTo}. Enter it here to finish setting up your account.
              </AppText>
            </Animated.View>

            <Animated.View entering={enter(2)} style={{ marginTop: space.xl2 }}>
              <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
                Code
              </AppText>
              <TextInput
                accessibilityLabel="Confirmation code"
                value={code}
                onChangeText={onCodeChange}
                placeholder={'0'.repeat(CODE_LENGTH)}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                maxLength={CODE_MAX}
                editable={!busy}
                style={{
                  minHeight: 56,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: code.length >= CODE_MIN ? colors.accentText : colors.stroke,
                  backgroundColor: colors.inset,
                  paddingHorizontal: space.md,
                  fontFamily: fonts.monoMedium,
                  fontSize: 24,
                  letterSpacing: 6,
                  textAlign: 'center',
                  color: colors.text,
                }}
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

            {notice ? (
              <AppText
                variant="small"
                color="successText"
                accessibilityLiveRegion="polite"
                style={{ marginTop: space.md }}
              >
                {notice}
              </AppText>
            ) : null}

            <Animated.View entering={enter(3)} style={{ marginTop: space.xl, gap: space.md }}>
              <Button
                label="Confirm"
                onPress={() => void verify(code)}
                loading={busy}
                disabled={code.length < CODE_MIN}
                full
              />
              <PressableScale
                accessibilityLabel="Send another code"
                onPress={() => void resend()}
                style={{ paddingVertical: space.sm, alignItems: 'center' }}
              >
                <AppText variant="small" color="accentText">
                  Send another code
                </AppText>
              </PressableScale>
              <PressableScale
                accessibilityLabel="Use a different email"
                onPress={() => {
                  setSentTo(null);
                  setCode('');
                  setNotice(null);
                  setError(null);
                  setMode('signIn');
                  setPassword('');
                }}
                style={{ paddingVertical: space.sm, alignItems: 'center' }}
              >
                <AppText variant="small" color="textMuted">
                  Use a different email
                </AppText>
              </PressableScale>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
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
