import 'package:flutter/material.dart';

import '../../app_localizations.dart';

/// The calm stage reward: stars scale in, the points earned show once, and
/// one big button returns to the map (where the next stage stands unlocked).
/// No streaks, no loss — finishing is always a win.
class StageRewardScreen extends StatelessWidget {
  const StageRewardScreen({
    super.key,
    required this.stars,
    required this.xp,
    required this.unlockedNext,
  });

  final int stars;
  final int xp;
  final bool unlockedNext;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: const Color(0xFF16351F),
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var i = 0; i < 3; i++)
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: Duration(milliseconds: 350 + i * 220),
                      curve: Curves.elasticOut,
                      builder: (_, t, child) => Transform.scale(scale: t, child: child),
                      child: Icon(
                        i < stars ? Icons.star_rounded : Icons.star_border_rounded,
                        size: 84,
                        color: const Color(0xFFFFC800),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 24),
              Text(
                '+$xp',
                style: const TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                ),
              ),
              if (unlockedNext) ...[
                const SizedBox(height: 18),
                Text(
                  l.translate('world_grew'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF9BE24A),
                  ),
                ),
              ],
              const SizedBox(height: 40),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF58CC02),
                  padding: const EdgeInsets.symmetric(horizontal: 56, vertical: 18),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                ),
                onPressed: () => Navigator.of(context).pop(),
                child: Text(
                  l.translate('world_continue'),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
