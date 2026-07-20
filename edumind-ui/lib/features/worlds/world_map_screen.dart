import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../app_localizations.dart';
import '../player/player_screen.dart';
import 'stage_reward_screen.dart';
import 'stage_stars.dart';
import 'world_models.dart';
import 'world_store.dart';

/// The world map — a playful winding trail of short lesson stages
/// (Recognize → Understand → Apply → Challenge). Deliberately simpler and
/// warmer than the middle-school journey map: big nodes, one tap, no text
/// beyond stage names. Everything is bundled assets, so the whole loop works
/// offline and replays cost nothing.
class WorldMapScreen extends StatefulWidget {
  const WorldMapScreen({super.key, required this.worldAsset});

  final String worldAsset;

  @override
  State<WorldMapScreen> createState() => _WorldMapScreenState();
}

class _WorldMapScreenState extends State<WorldMapScreen> {
  WorldDef? _world;
  WorldStore? _store;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final world = await WorldDef.load(widget.worldAsset);
    final store = await WorldStore.load();
    if (mounted) {
      setState(() {
        _world = world;
        _store = store;
      });
    }
  }

  Future<void> _playStage(WorldStage stage) async {
    final world = _world!;
    final store = _store!;
    final raw = await rootBundle.loadString('assets/samples/${stage.specFile}');
    final spec = jsonDecode(raw) as Map<String, dynamic>;
    if (!mounted) return;

    final completedBefore = store.completedStages(world.id);
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => PlayerScreen(launch: PlayerLaunch.stage(spec))),
    );
    if (!mounted) return;
    final summary = result?['summary'] as Map<String, dynamic>?;
    if (summary == null) return; // backed out mid-stage — nothing recorded

    final stars = starsForStageSummary(summary);
    final kept = await store.recordStars(world.id, stage.id, stars);
    final unlockedNext = !completedBefore.contains(stage.id) &&
        world.stages.indexOf(stage) < world.stages.length - 1;
    if (!mounted) return;
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => StageRewardScreen(
          stars: kept,
          xp: ((summary['xp'] as num?) ?? 0).toInt(),
          unlockedNext: unlockedNext,
        ),
      ),
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final world = _world;
    final store = _store;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1C6B35), Color(0xFF238042), Color(0xFF2E8B4F)],
          ),
        ),
        child: SafeArea(
          child: world == null || store == null
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : Column(
                  children: [
                    _header(world),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: _trail(l, world, store),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _header(WorldDef world) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 28),
              onPressed: () => Navigator.of(context).pop(),
            ),
            const SizedBox(width: 4),
            Text(world.emoji, style: const TextStyle(fontSize: 30)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                world.title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      );

  Widget _trail(AppLocalizations l, WorldDef world, WorldStore store) {
    final completed = store.completedStages(world.id);
    final states = stageNodeStates(world.stages, completed);
    final children = <Widget>[];
    for (var i = 0; i < world.stages.length; i++) {
      final stage = world.stages[i];
      final alignStart = i.isEven;
      children.add(_stageNode(
        stage: stage,
        state: states[i],
        stars: store.starsFor(world.id, stage.id),
        alignStart: alignStart,
      ));
      children.add(_pathLine());
    }
    children.add(_soonNode(l, alignStart: world.stages.length.isEven));
    return Column(children: children);
  }

  Widget _pathLine() => Container(
        width: 6,
        height: 34,
        margin: const EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(3),
        ),
      );

  Widget _stageNode({
    required WorldStage stage,
    required StageNodeState state,
    required int stars,
    required bool alignStart,
  }) {
    final locked = state == StageNodeState.locked;
    final current = state == StageNodeState.current;
    final done = state == StageNodeState.completed;

    final circle = Container(
      width: 84,
      height: 84,
      decoration: BoxDecoration(
        color: done
            ? const Color(0xFF58CC02)
            : current
                ? Colors.white
                : Colors.black.withValues(alpha: 0.25),
        shape: BoxShape.circle,
        border: current ? Border.all(color: const Color(0xFFFFC800), width: 5) : null,
        boxShadow: locked
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 10,
                  offset: const Offset(0, 5),
                ),
              ],
      ),
      alignment: Alignment.center,
      child: Text(
        locked ? '🔒' : stage.emoji,
        style: TextStyle(fontSize: 34, color: locked ? Colors.white54 : null),
      ),
    );

    return Align(
      alignment: alignStart ? const Alignment(-0.55, 0) : const Alignment(0.55, 0),
      child: GestureDetector(
        onTap: locked ? null : () => _playStage(stage),
        child: Column(
          children: [
            circle,
            const SizedBox(height: 6),
            Text(
              stage.title,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: locked ? Colors.white54 : Colors.white,
              ),
            ),
            if (done)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var s = 0; s < 3; s++)
                    Icon(
                      s < stars ? Icons.star_rounded : Icons.star_border_rounded,
                      size: 20,
                      color: const Color(0xFFFFC800),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _soonNode(AppLocalizations l, {required bool alignStart}) => Align(
        alignment: alignStart ? const Alignment(-0.55, 0) : const Alignment(0.55, 0),
        child: Column(
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.18),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white24, width: 3),
              ),
              alignment: Alignment.center,
              child: const Text('🎉', style: TextStyle(fontSize: 32)),
            ),
            const SizedBox(height: 6),
            Text(
              l.translate('world_finale_soon'),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Colors.white54,
              ),
            ),
          ],
        ),
      );
}
