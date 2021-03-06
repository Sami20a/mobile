import { ButtonCell } from '@Components/ButtonCell';
import { SectionedAccessoryTableCell } from '@Components/SectionedAccessoryTableCell';
import { SectionedTableCell } from '@Components/SectionedTableCell';
import { SectionHeader } from '@Components/SectionHeader';
import { AppStateType, PasscodeKeyboardType } from '@Lib/ApplicationState';
import { MobileDeviceInterface } from '@Lib/interface';
import { useFocusEffect } from '@react-navigation/native';
import { ApplicationContext } from '@Root/ApplicationContext';
import { ModalStackNavigationProp } from '@Root/ModalStack';
import { SCREEN_AUTHENTICATE } from '@Screens/screens';
import { StyleKitContext } from '@Style/StyleKit';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Alert, BackHandler, Platform, TextInput } from 'react-native';
import FingerprintScanner from 'react-native-fingerprint-scanner';
import { ChallengeReason, ChallengeType, ChallengeValue } from 'snjs';
import { ThemeContext } from 'styled-components/native';
import {
  BaseView,
  Container,
  Input,
  SectionContainer,
  SourceContainer,
  StyledSectionedTableCell,
  Subtitle,
} from './Authenticate.styled';
import {
  authenticationReducer,
  AuthenticationValueStateType,
  findMatchingValueIndex,
  getLabelForStateAndType,
  getTitleForStateAndType,
  isInActiveState,
} from './helpers';

type Props = ModalStackNavigationProp<typeof SCREEN_AUTHENTICATE>;

const STRING_ENTER_PASSCODE_FOR_MIGRATION =
  'Your application passcode is required to perform an upgrade of your local data storage structure.';
const STRING_AUTHENTICATION_REQUIRED =
  'Authentication is required to unlock application.';
const STRING_ENTER_PASSCODE_FOR_LOGIN_REGISTER =
  'Enter your application passcode before signing in or registering.';

export const Authenticate = ({
  route: {
    params: { challenge },
  },
  navigation,
}: Props) => {
  // Context
  const application = useContext(ApplicationContext);
  const styleKit = useContext(StyleKitContext);
  const theme = useContext(ThemeContext);

  // State
  const [supportsBiometrics, setSupportsBiometrics] = useState<
    boolean | undefined
  >(undefined);
  const [keyboardType, setKeyboardType] = useState<
    PasscodeKeyboardType | undefined
  >(undefined);
  const [{ challengeValues, challengeValueStates }, dispatch] = useReducer(
    authenticationReducer,
    {
      challengeValues: challenge.types.map(challengeType => ({
        value: false,
        type: challengeType,
      })),
      challengeValueStates: challenge.types.map(
        () => AuthenticationValueStateType.WaitingTurn
      ),
    },
    undefined
  );

  // Refs
  const localPasscodeRef = useRef<TextInput>(null);
  const accountPasswordRef = useRef<TextInput>(null);

  const validateChallengeValue = useCallback(
    async (challengeValue: ChallengeValue) => {
      const index = findMatchingValueIndex(
        challengeValues,
        challengeValue.type
      );
      const state = challengeValueStates[index];

      if (
        state === AuthenticationValueStateType.Locked ||
        state === AuthenticationValueStateType.Success
      ) {
        return;
      }

      dispatch({
        type: 'setState',
        valueType: challengeValue.type,
        state: AuthenticationValueStateType.Pending,
      });

      await application?.submitValuesForChallenge(challenge, [challengeValue]);
    },
    [challengeValues, challengeValueStates, application, challenge]
  );

  const onValueLocked = useCallback((challengeValue: ChallengeValue) => {
    dispatch({
      type: 'setState',
      valueType: challengeValue.type,
      state: AuthenticationValueStateType.Locked,
    });

    setTimeout(() => {
      dispatch({
        type: 'setState',
        valueType: challengeValue.type,
        state: AuthenticationValueStateType.WaitingTurn,
      });
    }, 30 * 1000);
  }, []);

  const checkForBiometrics = useCallback(
    async () =>
      (application?.deviceInterface as MobileDeviceInterface).getDeviceBiometricsAvailability(),
    [application]
  );

  const checkPasscodeKeyboardType = useCallback(
    async () => application?.getAppState().getPasscodeKeyboardType(),
    [application]
  );

  const authenticateBiometrics = useCallback(
    async (challengeValue: ChallengeValue) => {
      let hasBiometrics = supportsBiometrics;
      if (supportsBiometrics === undefined) {
        hasBiometrics = await checkForBiometrics();
        setSupportsBiometrics(hasBiometrics);
      }
      if (!hasBiometrics) {
        FingerprintScanner.release();
        dispatch({
          type: 'setState',
          valueType: challengeValue.type,
          state: AuthenticationValueStateType.Fail,
        });
        Alert.alert(
          'Unsuccessful',
          'This device either does not have a biometric sensor or it may not configured.'
        );
        return;
      }

      if (Platform.OS === 'android') {
        try {
          await application
            ?.getAppState()
            .performActionWithoutStateChangeImpact(async () => {
              await FingerprintScanner.authenticate({
                // @ts-ignore ts type does not exist for deviceCredentialAllowed
                deviceCredentialAllowed: true,
                description: 'Biometrics are required to access your notes.',
              });
            });

          FingerprintScanner.release();
          const newChallengeValue = { ...challengeValue, value: true };

          onValueChange(newChallengeValue);
          return validateChallengeValue(newChallengeValue);
        } catch (error) {
          FingerprintScanner.release();

          if (error.name === 'DeviceLocked') {
            onValueLocked(challengeValue);
            FingerprintScanner.release();
            Alert.alert(
              'Unsuccessful',
              'Authentication failed. Wait 30 seconds to try again.'
            );
          } else {
            dispatch({
              type: 'setState',
              valueType: challengeValue.type,
              state: AuthenticationValueStateType.Fail,
            });
            Alert.alert(
              'Unsuccessful',
              'Authentication failed. Tap to try again.'
            );
          }
        }
      } else {
        // iOS
        try {
          await application
            ?.getAppState()
            .performActionWithoutStateChangeImpact(async () => {
              await FingerprintScanner.authenticate({
                fallbackEnabled: true,
                description: 'This is required to access your notes.',
              });
            });
          FingerprintScanner.release();
          const newChallengeValue = { ...challengeValue, value: true };
          onValueChange(newChallengeValue);
          return validateChallengeValue(newChallengeValue);
        } catch (error_1) {
          onValueChange({ ...challengeValue, value: false });
          FingerprintScanner.release();
          if (error_1.name !== 'UserCancel') {
            Alert.alert('Unsuccessful');
          } else {
            Alert.alert(
              'Unsuccessful',
              'Authentication failed. Tap to try again.'
            );
          }
          dispatch({
            type: 'setState',
            valueType: challengeValue.type,
            state: AuthenticationValueStateType.Fail,
          });
        }
      }
    },
    [
      application,
      checkForBiometrics,
      onValueLocked,
      supportsBiometrics,
      validateChallengeValue,
    ]
  );

  const firstNotSuccessful = useMemo(
    () =>
      challengeValueStates.findIndex(
        state => state !== AuthenticationValueStateType.Success
      ),
    [challengeValueStates]
  );

  const beginAuthenticatingForNextChallengeReason = useCallback(
    (completedChallengeValue?: ChallengeValue) => {
      let challengeValue;
      if (completedChallengeValue === undefined) {
        challengeValue = challengeValues[firstNotSuccessful];
      } else {
        const index = findMatchingValueIndex(
          challengeValues,
          completedChallengeValue.type
        );

        if (!challengeValues.hasOwnProperty(index + 1)) {
          return;
        }
        challengeValue = challengeValues[index + 1];
      }

      /**
       * Authentication modal may be displayed on lose focus just before the app
       * is closing. In this state however, we don't want to begin auth. We'll
       * wait until the app gains focus.
       */
      const isLosingFocusOrInBackground =
        application?.getAppState().getMostRecentState() ===
          AppStateType.LosingFocus ||
        application?.getAppState().getMostRecentState() ===
          AppStateType.EnteringBackground;

      if (
        challengeValue.type === ChallengeType.Biometric &&
        !isLosingFocusOrInBackground
      ) {
        /** Begin authentication right away, we're not waiting for any input */
        authenticateBiometrics(challengeValue);
      }
      if (challengeValue.type === ChallengeType.LocalPasscode) {
        localPasscodeRef.current?.focus();
      } else if (challengeValue.type === ChallengeType.AccountPassword) {
        accountPasswordRef.current?.focus();
      }

      dispatch({
        type: 'setState',
        valueType: challengeValue.type,
        state: AuthenticationValueStateType.WaitingInput,
      });
    },
    [application, authenticateBiometrics, challengeValues, firstNotSuccessful]
  );

  const onValidValue = useCallback(
    (value: ChallengeValue) => {
      dispatch({
        type: 'setState',
        valueType: value.type,
        state: AuthenticationValueStateType.Success,
      });
      beginAuthenticatingForNextChallengeReason(value);
    },
    [beginAuthenticatingForNextChallengeReason]
  );

  const onInvalidValue = (value: ChallengeValue) => {
    dispatch({
      type: 'setState',
      valueType: value.type,
      state: AuthenticationValueStateType.Fail,
    });
  };
  useEffect(() => {
    const removeAppStateSubscriber = application
      ?.getAppState()
      .addStateChangeObserver(state => {
        if (state === AppStateType.ResumingFromBackground) {
          beginAuthenticatingForNextChallengeReason();
        }
        if (state === AppStateType.EnteringBackground) {
          FingerprintScanner.release();
        }
      });

    return removeAppStateSubscriber;
  }, [application, beginAuthenticatingForNextChallengeReason]);

  useEffect(() => {
    if (application?.setChallengeCallbacks) {
      application?.setChallengeCallbacks({
        challenge,
        onValidValue,
        onInvalidValue,
        onComplete: () => {
          navigation.goBack();
        },
      });
    }
  }, [application, challenge, navigation, onValidValue]);

  useEffect(() => {
    let mounted = true;
    const setBiometricsAsync = async () => {
      if (challenge.reason !== ChallengeReason.Migration) {
        const hasBiometrics = await checkForBiometrics();
        if (mounted) {
          setSupportsBiometrics(hasBiometrics);
        }
      }
    };
    setBiometricsAsync();
    const setInitialKeyboardType = async () => {
      if (challenge.reason !== ChallengeReason.Migration) {
        const initialKeyboardType = await checkPasscodeKeyboardType();
        if (mounted) {
          setKeyboardType(initialKeyboardType);
        }
      }
    };
    setInitialKeyboardType();
    return () => {
      mounted = false;
    };
  }, [challenge.reason, checkForBiometrics, checkPasscodeKeyboardType]);

  useEffect(() => {
    beginAuthenticatingForNextChallengeReason();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBiometricDirectPress = () => {
    const index = findMatchingValueIndex(
      challengeValues,
      ChallengeType.Biometric
    );
    const state = challengeValueStates[index];
    if (state === AuthenticationValueStateType.Locked) {
      return;
    }

    beginAuthenticatingForNextChallengeReason();
  };

  const onValueChange = (newValue: ChallengeValue) => {
    dispatch({
      type: 'setValue',
      valueType: newValue.type,
      value: newValue.value,
    });
  };

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        // Always block back button on Android
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () =>
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );

  const onSubmitPress = () => {
    const challengeValue = challengeValues[firstNotSuccessful];
    const index = findMatchingValueIndex(challengeValues, challengeValue.type);
    const state = challengeValueStates[index];
    if (
      challengeValue.type === ChallengeType.Biometric &&
      (state === AuthenticationValueStateType.Locked ||
        state === AuthenticationValueStateType.Fail)
    ) {
      beginAuthenticatingForNextChallengeReason();
      return;
    }

    validateChallengeValue(challengeValue);
  };

  const switchKeyboard = () => {
    if (keyboardType === PasscodeKeyboardType.Default) {
      setKeyboardType(PasscodeKeyboardType.Numeric);
    } else if (keyboardType === PasscodeKeyboardType.Numeric) {
      setKeyboardType(PasscodeKeyboardType.Default);
    }
  };

  const renderAuthenticationSource = (
    challengeValue: ChallengeValue,
    index: number
  ) => {
    const first = index === 0;
    const last = index === challengeValues.length - 1;
    const state = challengeValueStates[index];
    const active = isInActiveState(state);
    const isInput =
      challengeValue.type === ChallengeType.LocalPasscode ||
      challengeValue.type === ChallengeType.AccountPassword;
    const stateLabel = getLabelForStateAndType(challengeValue, state);
    const stateTitle = getTitleForStateAndType(challengeValue, state);

    return (
      <SourceContainer key={challengeValue.type}>
        <SectionHeader
          title={stateTitle}
          subtitle={isInput ? stateLabel : undefined}
          tinted={active}
          buttonText={
            challengeValue.type === ChallengeType.LocalPasscode &&
            state === AuthenticationValueStateType.WaitingInput
              ? 'Change Keyboard'
              : undefined
          }
          buttonAction={switchKeyboard}
          buttonStyles={
            challengeValue.type === ChallengeType.LocalPasscode
              ? {
                  color: theme.stylekitNeutralColor,
                  fontSize: theme.mainTextFontSize - 5,
                }
              : undefined
          }
        />
        {isInput && (
          <SectionContainer last={last}>
            <SectionedTableCell textInputCell={true} first={first}>
              <Input
                key={Platform.OS === 'android' ? keyboardType : undefined}
                ref={
                  challengeValue.type === ChallengeType.LocalPasscode
                    ? localPasscodeRef
                    : accountPasswordRef
                }
                placeholder={
                  challengeValue.type === ChallengeType.LocalPasscode
                    ? 'Local Passcode'
                    : 'Account password'
                }
                onChangeText={text => {
                  onValueChange({ ...challengeValue, value: text });
                }}
                value={(challengeValue.value || '') as string}
                autoCorrect={false}
                autoFocus={false}
                autoCapitalize={'none'}
                secureTextEntry={true}
                keyboardType={keyboardType}
                keyboardAppearance={styleKit?.keyboardColorForActiveTheme()}
                underlineColorAndroid={'transparent'}
                onSubmitEditing={() => {
                  validateChallengeValue(challengeValue);
                }}
              />
            </SectionedTableCell>
          </SectionContainer>
        )}
        {challengeValue.type === ChallengeType.Biometric && (
          <SectionContainer last={last}>
            <SectionedAccessoryTableCell
              first={first}
              dimmed={active}
              tinted={active}
              text={stateLabel}
              onPress={onBiometricDirectPress}
            />
          </SectionContainer>
        )}
      </SourceContainer>
    );
  };

  const isPending = useMemo(
    () =>
      challengeValueStates.findIndex(
        state => state === AuthenticationValueStateType.Pending
      ) >= 0,
    [challengeValueStates]
  );

  const textData = useMemo(() => {
    switch (challenge.reason) {
      case ChallengeReason.Migration:
        return STRING_ENTER_PASSCODE_FOR_MIGRATION;
      case ChallengeReason.ResaveRootKey:
        return STRING_ENTER_PASSCODE_FOR_LOGIN_REGISTER;
      default:
        return STRING_AUTHENTICATION_REQUIRED;
    }
  }, [challenge.reason]);

  return (
    <Container>
      <StyledSectionedTableCell first>
        <BaseView>
          <Subtitle>{textData}</Subtitle>
        </BaseView>
      </StyledSectionedTableCell>
      {challengeValues.map((challengeValue, index) =>
        renderAuthenticationSource(challengeValue, index)
      )}
      <ButtonCell
        maxHeight={45}
        disabled={isPending}
        title={
          firstNotSuccessful === challengeValueStates.length - 1
            ? 'Submit'
            : 'Next'
        }
        bold={true}
        onPress={onSubmitPress}
      />
    </Container>
  );
};
