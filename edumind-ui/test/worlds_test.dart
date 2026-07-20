import 'package:edumind/features/worlds/stage_stars.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:edumind/features/worlds/world_models.dart';
import 'package:edumind/features/worlds/world_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  WorldStage stage(String id) =>
      WorldStage(id: id, level: 'recognize', title: id, emoji: '⭐', specFile: '$id.json');

  group('sequential stage unlock (primary twin of journey_logic)', () {
    final stages = [stage('s1'), stage('s2'), stage('s3'), stage('s4')];

    test('a fresh world opens only its first stage', () {
      expect(stageNodeStates(stages, {}), [
        StageNodeState.current,
        StageNodeState.locked,
        StageNodeState.locked,
        StageNodeState.locked,
      ]);
    });

    test('each completion moves the child forward, completed stays open', () {
      expect(stageNodeStates(stages, {'s1', 's2'}), [
        StageNodeState.completed,
        StageNodeState.completed,
        StageNodeState.current,
        StageNodeState.locked,
      ]);
    });

    test('a fully completed world has no current stage', () {
      expect(
        stageNodeStates(stages, {'s1', 's2', 's3', 's4'}),
        everyElement(StageNodeState.completed),
      );
    });
  });

  group('stage summary → stars (middle-school bands reused)', () {
    Map<String, dynamic> summary(List<bool> corrects) => {
          'items': [for (final c in corrects) {'correct': c}],
        };

    test('clean sweep of first-try records earns 3', () {
      expect(starsForStageSummary(summary([true, true, true])), 3);
    });

    test('a majority earns 2; finishing always earns the trying star', () {
      expect(starsForStageSummary(summary([true, true, false])), 2);
      expect(starsForStageSummary(summary([false, false, true])), 1);
    });

    test('an unscored discovery stage is completed by reaching the end', () {
      expect(starsForStageSummary({'items': []}), 3);
      expect(starsForStageSummary(null), 3);
    });
  });

  group('WorldStore (local-first, best-result semantics)', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      WorldStore.resetForTests();
    });

    test('records stars and reports completion per world', () async {
      final store = await WorldStore.load();
      expect(store.completedStages('w1'), isEmpty);
      await store.recordStars('w1', 's1', 2);
      expect(store.starsFor('w1', 's1'), 2);
      expect(store.completedStages('w1'), {'s1'});
      expect(store.completedStages('w2'), isEmpty);
    });

    test('replaying can only keep or raise stars — never lower them', () async {
      final store = await WorldStore.load();
      await store.recordStars('w1', 's1', 3);
      final kept = await store.recordStars('w1', 's1', 1);
      expect(kept, 3);
      expect(store.starsFor('w1', 's1'), 3);
    });
  });

  group('bundled world manifest', () {
    test('the Grade-3 world loads with four leveled stages', () async {
      final world = await WorldDef.load(kBundledWorlds[0]);
      expect(world.id, 'lines_angles_g3');
      expect(world.grade, 3);
      expect(world.stages, hasLength(4));
      expect(
        world.stages.map((s) => s.level).toList(),
        ['recognize', 'understand', 'apply', 'challenge'],
      );
      // Every stage's spec asset must exist and be a lesson spec.
      for (final s in world.stages) {
        final raw = await rootBundle.loadString('assets/samples/${s.specFile}');
        expect(raw, contains('"lesson"'));
      }
    });
  });
}
