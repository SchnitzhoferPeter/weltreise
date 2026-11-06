import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class LaeuferApp extends Application.AppBase {

    hidden var _view as LaeuferView?;

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        _view = new LaeuferView();
        return [_view];
    }

    // Einstellungen wurden in Garmin Connect / Connect IQ geändert
    function onSettingsChanged() as Void {
        if (_view != null) {
            _view.loadSettings();
        }
        WatchUi.requestUpdate();
    }
}
