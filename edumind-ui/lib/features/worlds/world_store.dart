/// Local-first world progress — stars per stage, keyed by world.
///
/// Same doctrine as the middle-school LearnProgressStore (SharedPreferences
/// as the instant offline source of truth), deliberately in its own
/// namespace with no shared state; backend sync arrives with the worlds
/// backend phase and will union/max-merge exactly like learn progress does.
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class WorldStore {
  WorldStore._(this._prefs);

  static const _key = 'worldStageStars';
  static WorldStore? _instance;

  final SharedPreferences _prefs;

  static Future<WorldStore> load() async {
    return _instance ??= WorldStore._(await SharedPreferences.getInstance());
  }

  /// Tests re-seed SharedPreferences between cases.
  static void resetForTests() => _instance = null;

  Map<String, Map<String, int>> _read() {
    final raw = _prefs.getString(_key);
    if (raw == null) return {};
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    return decoded.map((worldId, stages) => MapEntry(
          worldId,
          (stages as Map).map((k, v) => MapEntry(k.toString(), (v as num).toInt())),
        ));
  }

  Future<void> _write(Map<String, Map<String, int>> all) =>
      _prefs.setString(_key, jsonEncode(all));

  int starsFor(String worldId, String stageId) => _read()[worldId]?[stageId] ?? 0;

  Set<String> completedStages(String worldId) =>
      (_read()[worldId] ?? const {}).keys.toSet();

  /// Best-result semantics: replaying a stage can only keep or raise stars —
  /// progress is sacred, kindness never lowers it.
  Future<int> recordStars(String worldId, String stageId, int stars) async {
    final all = _read();
    final world = all.putIfAbsent(worldId, () => {});
    final best = world[stageId] ?? 0;
    final kept = stars > best ? stars : best;
    world[stageId] = kept;
    await _write(all);
    return kept;
  }
}
