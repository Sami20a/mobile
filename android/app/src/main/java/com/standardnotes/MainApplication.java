package com.standardnotes;

import android.app.Application;
import android.app.Activity;
import android.content.Context;

import com.bugsnag.android.BreadcrumbType;
import com.bugsnag.android.Configuration;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.soloader.SoLoader;
import java.lang.reflect.InvocationTargetException;
import java.util.HashSet;
import java.util.List;

import com.bugsnag.android.Bugsnag;
import com.facebook.react.modules.network.OkHttpClientProvider;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.WindowManager;

import com.kristiansorens.flagsecure.FlagSecure;

import org.standardnotes.SNReactNative.SNReactNativePackage;

import java.lang.reflect.InvocationTargetException;

public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost = new ReactNativeHost(this) {
    @Override
    public boolean getUseDeveloperSupport() {
      return BuildConfig.DEBUG;
    }

    @Override
    protected List<ReactPackage> getPackages() {
      @SuppressWarnings("UnnecessaryLocalVariable")
      List<ReactPackage> packages = new PackageList(this).getPackages();

      return packages;
    }

    @Override
    protected String getJSMainModuleName() {
      return "index";
    }
  };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @SuppressLint("NewApi")
  @Override
  public void onCreate() {
    super.onCreate();

    rebuildOkHtttp();

    Configuration config = Configuration.load(this);
    config.setEnabledBreadcrumbTypes(new HashSet<BreadcrumbType>() {{
      add(BreadcrumbType.NAVIGATION);
      add(BreadcrumbType.STATE);
      add(BreadcrumbType.PROCESS);
      add(BreadcrumbType.MANUAL);
      add(BreadcrumbType.USER);
      add(BreadcrumbType.LOG);
      add(BreadcrumbType.ERROR);
    }});

    Bugsnag.start(this, config);

    SoLoader.init(this, /* native exopackage */ false);

    initializeFlipper(this, getReactNativeHost().getReactInstanceManager());

    registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
      @Override
      public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
        activity.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
      }


      @Override
      public void onActivityStarted(Activity activity) {
        if(FlagSecure.instance != null && FlagSecure.instance.enabled) {
          activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
      }

      @Override
      public void onActivityResumed(Activity activity) {

      }

      @Override
      public void onActivityPaused(Activity activity) {
      }

      @Override
      public void onActivityStopped(Activity activity) {
      }

      public void onActivitySaveInstanceState(Activity activity, Bundle bundle) {

      }

      @Override
      public void onActivityDestroyed(Activity activity) {
      }

    });
  }

  private void rebuildOkHtttp() {
    OkHttpClientProvider.setOkHttpClientFactory(new CustomClientFactory());
  }

   /**
   * Loads Flipper in React Native templates. Call this in the onCreate method with something like
   * initializeFlipper(this, getReactNativeHost().getReactInstanceManager());
   *
   * @param context
   * @param reactInstanceManager
   */
  private static void initializeFlipper(
      Context context, ReactInstanceManager reactInstanceManager) {
    if (BuildConfig.DEBUG) {
      try {
        /*
         We use reflection here to pick up the class that initializes Flipper,
        since Flipper library is not available in release mode
        */
        Class<?> aClass = Class.forName("com.rndiffapp.ReactNativeFlipper");
        aClass
            .getMethod("initializeFlipper", Context.class, ReactInstanceManager.class)
            .invoke(null, context, reactInstanceManager);
      } catch (ClassNotFoundException e) {
        e.printStackTrace();
      } catch (NoSuchMethodException e) {
        e.printStackTrace();
      } catch (IllegalAccessException e) {
        e.printStackTrace();
      } catch (InvocationTargetException e) {
        e.printStackTrace();
      }
    }
  }
}
