import { MobileApplication } from '@Lib/application';
import CSSParser from '@Style/Util/CSSParser';
import {
  DARK_CONTENT,
  keyboardColorForTheme,
  LIGHT_CONTENT,
  statusBarColorForTheme,
} from '@Style/utils';
import React from 'react';
import {
  Alert,
  Appearance,
  Platform,
  StatusBar,
  TextStyle,
  ViewStyle,
} from 'react-native';
import {
  ApplicationEvent,
  removeFromArray,
  SNComponent,
  SNTheme,
  StorageValueModes,
} from 'snjs';
import { UuidString } from 'snjs/dist/@types/types';
import THEME_DARK_JSON from './Themes/blue-dark.json';
import THEME_BLUE_JSON from './Themes/blue.json';
import THEME_RED_JSON from './Themes/red.json';
import { StyleKitTheme } from './Themes/styled-components';

const LIGHT_THEME_KEY = 'lightTheme';
const DARK_THEME_KEY = 'darkTheme';
const CACHED_THEMES_KEY = 'cachedThemesKey';

type ThemeChangeObserver = () => Promise<void> | void;

export interface ThemeContent {
  isSystemTheme: boolean;
  isInitial: boolean;
  name: string;
  luminosity?: number;
  isSwapIn?: boolean;
  uuid: string;
  variables: StyleKitTheme;
  package_info: SNComponent['package_info'];
}

enum SystemThemes {
  Blue = 'Blue',
  Dark = 'Dark',
  Red = 'Red',
}

export const StyleKitContext = React.createContext<StyleKit | undefined>(
  undefined
);

export class StyleKit {
  observers: ThemeChangeObserver[] = [];
  private themeData: Record<UuidString, ThemeContent> = {};
  activeThemeId?: string;
  static constants = {
    mainTextFontSize: 16,
    paddingLeft: 14,
  };
  styles: Record<string, ViewStyle | TextStyle> = {};
  theme?: StyleKitTheme;
  application: MobileApplication;
  unregisterComponentHandler?: () => void;
  unsubscribeStreamThemes?: () => void;
  unsubsribeAppEventObserver?: () => void;

  constructor(application: MobileApplication) {
    this.application = application;
    this.buildSystemThemesAndData();
    this.registerObservers();
  }

  async init() {
    await this.setExternalThemes();
    await this.resolveInitialThemeForMode();
    Appearance.addChangeListener(this.onColorSchemeChange.bind(this));
  }

  deinit() {
    Appearance.removeChangeListener(this.onColorSchemeChange.bind(this));
    this.unregisterComponentHandler && this.unregisterComponentHandler();
    this.unsubscribeStreamThemes && this.unsubscribeStreamThemes();
    this.unsubsribeAppEventObserver && this.unsubsribeAppEventObserver();
  }

  private registerObservers() {
    this.unsubsribeAppEventObserver = this.application.addEventObserver(
      async event => {
        /**
         * If there are any migrations we need to set default theme to start UI
         */
        if (event === ApplicationEvent.MigrationsLoaded) {
          if (await this.application.hasPendingMigrations()) {
            this.setDefaultTheme();
          }
        }
        if (event === ApplicationEvent.Launched) {
          // Resolve initial theme after app launched
          this.resolveInitialThemeForMode();
        }
      }
    );
  }

  private findOrCreateDataForTheme(themeId: string) {
    let data = this.themeData[themeId];
    if (!data) {
      data = {} as ThemeContent;
      this.themeData[themeId] = data;
    }
    return data;
  }

  private buildSystemThemesAndData() {
    const themeData = [
      {
        uuid: SystemThemes.Blue,
        variables: THEME_BLUE_JSON,
        name: SystemThemes.Blue,
        isInitial: this.getColorScheme() === 'light',
      },
      {
        uuid: SystemThemes.Dark,
        variables: THEME_DARK_JSON,
        name: SystemThemes.Dark,
        isInitial: this.getColorScheme() === 'dark',
      },
      {
        uuid: SystemThemes.Red,
        variables: THEME_RED_JSON,
        name: SystemThemes.Red,
      },
    ];

    for (const option of themeData) {
      const variables: StyleKitTheme = {
        ...option.variables,
        ...StyleKit.constants,
      };
      variables.statusBar =
        Platform.OS === 'android' ? LIGHT_CONTENT : DARK_CONTENT;

      this.themeData[option.uuid] = {
        isSystemTheme: true,
        isInitial: Boolean(option.isInitial),
        name: option.name,
        uuid: option.uuid,
        variables: variables,
        package_info: {
          dock_icon: {
            type: 'circle',
            background_color: variables.stylekitInfoColor,
            border_color: variables.stylekitInfoColor,
          },
        },
      };
    }
  }

  private onColorSchemeChange() {
    this.resolveInitialThemeForMode();
  }

  /**
   * Returns color scheme or light scheme as a default
   */
  private getColorScheme() {
    return Appearance.getColorScheme() || 'light';
  }

  /**
   * Registers an observer for theme change
   * @returns function that unregisters this observer
   */
  public addThemeChangeObserver(callback: ThemeChangeObserver) {
    this.observers.push(callback);
    return () => {
      removeFromArray(this.observers, callback);
    };
  }

  notifyObserversOfThemeChange() {
    for (const observer of this.observers) {
      observer();
    }
  }

  public async assignExternalThemeForMode(
    theme: SNTheme,
    mode: 'light' | 'dark'
  ) {
    const data = this.findOrCreateDataForTheme(theme.uuid);
    if (!data.hasOwnProperty('variables')) {
      if ((await this.downloadThemeAndReload(theme)) === false) {
        return;
      }
    }
    this.assignThemeForMode(theme.uuid, mode);
  }

  public async assignThemeForMode(themeId: string, mode: 'light' | 'dark') {
    this.setThemeForMode(mode, themeId);

    /**
     * If we're changing the theme for a specific mode and we're currently on
     * that mode, then activate this theme.
     */
    if (this.getColorScheme() === mode && this.activeThemeId !== themeId) {
      this.activateTheme(themeId);
    }
  }

  private async setThemeForMode(mode: 'light' | 'dark', themeId: string) {
    return this.application.setValue(
      mode === 'dark' ? DARK_THEME_KEY : LIGHT_THEME_KEY,
      themeId,
      StorageValueModes.Nonwrapped
    );
  }

  public async getThemeForMode(mode: 'light' | 'dark') {
    return this.application.getValue(
      mode === 'dark' ? DARK_THEME_KEY : LIGHT_THEME_KEY,
      StorageValueModes.Nonwrapped
    );
  }

  /**
   * When downloading an external theme, we can't depend on it having all the
   * variables present. So we will merge them with this template variable list
   * to make sure the end result has all variables the app expects. Return a
   * copy as the result may be modified before use.
   */
  templateVariables() {
    return Object.assign({}, THEME_BLUE_JSON);
  }

  private setDefaultTheme() {
    const defaultThemeId =
      this.getColorScheme() === 'dark' ? SystemThemes.Dark : SystemThemes.Blue;

    this.setActiveTheme(defaultThemeId);
  }

  private async resolveInitialThemeForMode() {
    try {
      const savedThemeId = await this.getThemeForMode(this.getColorScheme());
      const matchingThemeId = Object.keys(this.themeData).find(
        themeId => themeId === savedThemeId
      );
      if (matchingThemeId) {
        this.setActiveTheme(matchingThemeId);
      } else {
        this.setDefaultTheme();
      }
    } catch (e) {
      console.error('Error parsing initial theme', e);
      return this.setDefaultTheme();
    }
  }

  keyboardColorForActiveTheme() {
    return keyboardColorForTheme(
      this.findOrCreateDataForTheme(this.activeThemeId!)
    );
  }

  systemThemes() {
    return Object.values(this.themeData)
      .filter(th => th.isSystemTheme)
      .sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
  }

  externalThemes() {
    return Object.values(this.themeData)
      .filter(th => !th.isSystemTheme)
      .sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
  }

  setActiveTheme(themeId: string) {
    /** Merge default variables to ensure this theme has all the variables. */
    const themeData = this.findOrCreateDataForTheme(themeId);
    const variables = themeData.variables;
    themeData.variables = Object.assign(this.templateVariables(), variables);

    this.activeThemeId = themeId;

    this.updateDeviceForTheme(themeId);

    this.reloadStyles();

    this.notifyObserversOfThemeChange();
  }

  /**
   * Updates local device items for newly activated theme.
   *
   * This includes:
   *     - Status Bar color
   */
  private updateDeviceForTheme(themeId: string) {
    const theme = this.findOrCreateDataForTheme(themeId);
    const isAndroid = Platform.OS === 'android';
    /** On Android, a time out is required, especially during app startup. */
    setTimeout(
      () => {
        const statusBarColor = statusBarColorForTheme(theme);
        StatusBar.setBarStyle(statusBarColor, true);

        if (isAndroid) {
          /**
           * Android <= v22 does not support changing status bar text color.
           * It will always be white, so we have to make sure background color
           * has proper contrast.
           */
          if (Platform.Version <= 22) {
            StatusBar.setBackgroundColor('#000000');
          } else {
            StatusBar.setBackgroundColor(
              theme.variables.stylekitContrastBackgroundColor
            );
          }
        }
      },
      isAndroid ? 100 : 0
    );
  }

  private async downloadTheme(theme: SNTheme) {
    let errorBlock = (error: null) => {
      console.error('Theme download error', error);
    };

    let url = theme.hosted_url;

    if (!url) {
      errorBlock(null);
      return;
    }

    if (Platform.OS === 'android' && url.includes('localhost')) {
      url = url.replace('localhost', '10.0.2.2');
    }

    return new Promise(async resolve => {
      try {
        const response = await fetch(url, {
          method: 'GET',
        });
        const data = await response.text();
        let variables = CSSParser.cssToObject(data);

        resolve(variables);
      } catch (e) {
        resolve(null);
      }
    });
  }

  activateSystemTheme(themeId: string) {
    this.activateTheme(themeId);
  }

  async activateExternalTheme(theme: SNTheme) {
    const variables = await this.downloadTheme(theme);
    if (!variables) {
      Alert.alert('Not Available', 'This theme is not available on mobile.');
      return;
    }
    let data = this.findOrCreateDataForTheme(theme.uuid);
    const appliedVariables = Object.assign(this.templateVariables(), variables);
    const finalVariables = {
      ...appliedVariables,
      ...StyleKit.constants,
    };
    data = {
      isSystemTheme: false,
      isInitial: false,
      name: theme.name,
      uuid: theme.uuid,
      variables: finalVariables,
      package_info: {
        dock_icon: {
          type: 'circle',
          background_color: finalVariables.stylekitInfoColor,
          border_color: finalVariables.stylekitInfoColor,
        },
      },
    };
    this.themeData[theme.uuid] = data;
    this.activateTheme(theme.uuid);
    this.cacheThemes();
  }

  private activateTheme(themeId: string) {
    this.setActiveTheme(themeId);
    this.assignThemeForMode(themeId, this.getColorScheme());
  }

  private async setExternalThemes() {
    const cachedThemes = await this.loadCachedThemes();
    if (cachedThemes) {
      for (const theme of cachedThemes) {
        this.themeData[theme.uuid] = theme;
      }
    }
  }

  private async loadCachedThemes(): Promise<ThemeContent[] | undefined> {
    return this.application!.getValue(
      CACHED_THEMES_KEY,
      StorageValueModes.Nonwrapped
    );
  }

  private async cacheThemes() {
    const themes = this.externalThemes();
    return this.application!.setValue(
      CACHED_THEMES_KEY,
      themes,
      StorageValueModes.Nonwrapped
    );
  }

  private async decacheThemes() {
    if (this.application) {
      return this.application.removeValue(
        CACHED_THEMES_KEY,
        StorageValueModes.Nonwrapped
      );
    }
  }

  public async downloadThemeAndReload(theme: SNTheme) {
    const updatedVariables = await this.downloadTheme(theme);
    if (updatedVariables === null) {
      return false;
    }
    /** Merge default variables to ensure this theme has all the variables. */
    const appliedVariables = Object.assign(
      this.templateVariables(),
      updatedVariables
    );
    let data = this.findOrCreateDataForTheme(theme.uuid);
    data.variables = {
      ...appliedVariables,
      ...StyleKit.constants,
    };
    this.cacheThemes();
    if (theme.uuid === this.activeThemeId) {
      this.setActiveTheme(theme.uuid);
    }
    return true;
  }

  reloadStyles() {
    const { variables } = this.findOrCreateDataForTheme(this.activeThemeId!);

    this.theme = variables;
  }

  static doesDeviceSupportDarkMode() {
    /**
     * Android supportsDarkMode relies on a Configuration value in the API
     * that was not available until Android 8.0 (26)
     * https://developer.android.com/reference/android/content/res/Configuration#UI_MODE_NIGHT_UNDEFINED
     * iOS supports Dark mode from iOS 13
     */

    if (Platform.OS === 'android' && Platform.Version < 26) {
      return false;
    } else if (Platform.OS === 'ios') {
      const majorVersionIOS = parseInt(Platform.Version as string, 10);
      return majorVersionIOS >= 13;
    }

    return true;
  }

  static platformIconPrefix() {
    return Platform.OS === 'android' ? 'md' : 'ios';
  }

  static nameForIcon(iconName: string) {
    return StyleKit.platformIconPrefix() + '-' + iconName;
  }
}
