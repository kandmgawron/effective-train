/**
 * Rule-based exercise description generator.
 * Produces accurate, concise instructions based on exercise name and body part.
 */

interface DescRule {
  pattern: RegExp;
  description: string;
}

const rules: DescRule[] = [
  // === COMPOUND LIFTS ===
  { pattern: /^barbell\s*deadlift$|^deadlift$/i, description: 'Stand with feet hip-width apart, grip the bar outside your knees. Drive through your heels, extending hips and knees simultaneously. Keep your back flat and chest up throughout. Lower by hinging at the hips first.' },
  { pattern: /romanian\s*deadlift|rdl\b/i, description: 'Hold the bar at hip height with a slight knee bend. Hinge at the hips, pushing them back while lowering the weight along your legs. Keep your back flat and feel the stretch in your hamstrings. Drive hips forward to return.' },
  { pattern: /stiff[\s-]*leg.*deadlift/i, description: 'With legs nearly straight, hinge at the hips to lower the weight toward the floor. Keep the bar close to your body and back flat. Feel the deep stretch in your hamstrings before driving hips forward to stand.' },
  { pattern: /sumo\s*deadlift/i, description: 'Take a wide stance with toes pointed out. Grip the bar between your legs. Push knees out, drive through your heels, and extend hips and knees to stand. Keep chest up and back flat.' },
  { pattern: /trap\s*bar\s*deadlift|hex\s*bar/i, description: 'Step inside the trap bar, grip the handles at your sides. Push through your heels, extending hips and knees to stand tall. Keep your torso upright and core braced throughout.' },
  { pattern: /deficit\s*deadlift/i, description: 'Stand on a raised platform (1-3 inches). Perform a conventional deadlift with increased range of motion. The deficit increases demand on your legs off the floor.' },

  // === SQUATS ===
  { pattern: /barbell\s*(back\s*)?squat|barbell\s*full\s*squat/i, description: 'Position the bar across your upper back. Brace your core, push hips back and bend knees to lower until thighs are at least parallel. Drive through your heels to stand, keeping your chest up throughout.' },
  { pattern: /front\s*squat/i, description: 'Rest the bar on your front delts with elbows high. Brace your core, sit straight down between your hips, keeping torso upright. Drive through your heels to stand.' },
  { pattern: /goblet\s*squat/i, description: 'Hold a kettlebell or dumbbell at chest height with both hands. Sit down between your hips, keeping elbows inside your knees and torso upright. Push through heels to stand.' },
  { pattern: /hack\s*squat/i, description: 'Position your back against the pad with shoulders under the supports. Lower by bending your knees until thighs are parallel. Press through your feet to extend your legs.' },
  { pattern: /leg\s*press/i, description: 'Sit in the machine with feet shoulder-width on the platform. Lower the weight by bending your knees toward your chest. Press through your heels to extend your legs without locking your knees.' },
  { pattern: /bulgarian\s*split\s*squat/i, description: 'Place your rear foot on a bench behind you. Lower your body by bending your front knee until your rear knee nearly touches the floor. Drive through your front heel to stand.' },
  { pattern: /split\s*squat/i, description: 'Stand in a staggered stance. Lower your body by bending both knees until your rear knee nearly touches the floor. Push through your front foot to return to the start.' },
  { pattern: /pistol\s*squat/i, description: 'Stand on one leg with the other extended in front. Lower yourself by bending the standing leg, keeping your extended leg off the ground. Drive through your heel to stand back up.' },
  { pattern: /overhead\s*squat/i, description: 'Hold the bar overhead with a wide grip, arms locked. Squat down while keeping the bar directly over your midfoot. Maintain an upright torso and drive through your heels to stand.' },
  { pattern: /box\s*squat/i, description: 'Set up a box behind you at parallel depth. Squat back onto the box, pause briefly, then drive through your heels to stand explosively.' },
  { pattern: /bodyweight\s*squat/i, description: 'Stand with feet shoulder-width apart. Push your hips back and bend your knees to lower until thighs are parallel. Keep your chest up and drive through your heels to stand.' },
  { pattern: /plie.*squat/i, description: 'Take a wide stance with toes pointed out at 45 degrees. Lower by bending your knees, keeping them tracking over your toes. Squeeze your inner thighs and glutes to stand.' },

  // === BENCH PRESS ===
  { pattern: /barbell\s*bench\s*press|bench\s*press.*medium/i, description: 'Lie on the bench with eyes under the bar. Grip slightly wider than shoulder-width. Unrack, lower the bar to your mid-chest with control, then press up to full lockout. Keep your feet flat and shoulder blades retracted.' },
  { pattern: /incline.*bench\s*press|incline.*press/i, description: 'Set the bench to 30-45 degrees. Press the weight from your upper chest to lockout. Keep your shoulder blades pinched and feet flat on the floor.' },
  { pattern: /decline.*bench\s*press|decline.*press/i, description: 'Lie on a decline bench with feet secured. Lower the weight to your lower chest, then press to lockout. This emphasizes the lower chest.' },
  { pattern: /dumbbell\s*bench\s*press/i, description: 'Lie on a flat bench holding dumbbells at chest level. Press them up until arms are extended, then lower with control. Dumbbells allow a greater range of motion than a barbell.' },
  { pattern: /close[\s-]*grip.*bench/i, description: 'Grip the bar with hands shoulder-width apart. Lower to your lower chest, keeping elbows close to your body. Press to lockout. This shifts emphasis to the triceps.' },
  { pattern: /floor\s*press/i, description: 'Lie on the floor with knees bent. Press the weight from chest level to lockout. Your upper arms will touch the floor at the bottom, limiting range of motion and emphasizing lockout strength.' },

  // === ROWS ===
  { pattern: /bent[\s-]*over.*barbell\s*row|barbell\s*row/i, description: 'Hinge at the hips with a flat back, holding the bar with arms extended. Pull the bar to your lower chest, squeezing your shoulder blades together. Lower with control.' },
  { pattern: /one[\s-]*arm.*dumbbell\s*row|single[\s-]*arm.*row/i, description: 'Place one hand and knee on a bench. Pull the dumbbell to your hip, driving your elbow past your torso. Squeeze your lat at the top, then lower with control.' },
  { pattern: /seated.*cable\s*row|seated\s*row/i, description: 'Sit upright with feet on the platform and knees slightly bent. Pull the handle to your lower chest, squeezing your shoulder blades together. Extend arms with control.' },
  { pattern: /t[\s-]*bar\s*row/i, description: 'Straddle the bar with a hip hinge. Pull the weight to your chest, squeezing your shoulder blades together at the top. Lower with control, maintaining a flat back.' },
  { pattern: /pendlay\s*row/i, description: 'Start with the bar on the floor, hinged at the hips with a flat back. Explosively row the bar to your lower chest, then lower it back to the floor. Each rep starts from a dead stop.' },
  { pattern: /cable.*row|pulley.*row/i, description: 'Sit or stand with a neutral spine. Pull the cable attachment toward your torso, squeezing your shoulder blades together. Return with control, feeling the stretch in your lats.' },
  { pattern: /inverted\s*row/i, description: 'Hang from a bar or rings with your body straight. Pull your chest to the bar by squeezing your shoulder blades together. Lower with control. Adjust difficulty by changing your body angle.' },
  { pattern: /dumbbell.*incline\s*row/i, description: 'Lie face down on an incline bench. Let the dumbbells hang below you, then row them to your sides, squeezing your shoulder blades. Lower with control.' },
  { pattern: /renegade\s*row/i, description: 'Start in a push-up position holding dumbbells. Row one dumbbell to your hip while stabilizing with the other arm. Alternate sides, keeping your hips square to the ground.' },
  { pattern: /chest[\s-]*supported\s*row/i, description: 'Lie face down on an incline bench. Row the dumbbells to your sides, squeezing your shoulder blades together. The bench support removes lower back strain.' },

  // === PULL-UPS / PULLDOWNS ===
  { pattern: /pull[\s-]*up|pullup/i, description: 'Hang from a bar with an overhand grip slightly wider than shoulders. Pull yourself up until your chin clears the bar, driving your elbows down and back. Lower with control to a full hang.' },
  { pattern: /chin[\s-]*up|chinup/i, description: 'Hang from a bar with an underhand (supinated) grip at shoulder width. Pull yourself up until your chin clears the bar. The underhand grip increases bicep involvement.' },
  { pattern: /lat\s*pulldown|lat\s*pull[\s-]*down/i, description: 'Sit with thighs secured under the pad. Pull the bar to your upper chest, driving your elbows down and back. Squeeze your lats at the bottom, then return with control.' },
  { pattern: /muscle[\s-]*up/i, description: 'Start from a dead hang. Pull explosively and transition over the bar by rotating your wrists. Press to lockout above the bar. This combines a pull-up with a dip.' },

  // === SHOULDER PRESS ===
  { pattern: /overhead\s*press|military\s*press|standing.*press/i, description: 'Stand with feet shoulder-width apart, bar at shoulder height. Press the bar overhead to full lockout, moving your head through as the bar passes. Lower with control to your shoulders.' },
  { pattern: /dumbbell.*shoulder\s*press|seated.*dumbbell\s*press/i, description: 'Sit or stand holding dumbbells at shoulder height with palms forward. Press overhead to full lockout, then lower with control to shoulder level.' },
  { pattern: /arnold.*press/i, description: 'Start with dumbbells at shoulder height, palms facing you. As you press up, rotate your palms to face forward at the top. Reverse the rotation as you lower. This hits all three delt heads.' },
  { pattern: /push\s*press/i, description: 'Start with the bar at shoulder height. Dip slightly at the knees, then drive explosively through your legs to help press the bar overhead. Use the leg drive to move more weight than a strict press.' },
  { pattern: /handstand\s*push[\s-]*up/i, description: 'Kick up into a handstand against a wall. Lower yourself by bending your elbows until your head nearly touches the floor. Press back up to full lockout.' },

  // === LATERAL / FRONT RAISES ===
  { pattern: /lateral\s*raise|side\s*lateral/i, description: 'Stand holding dumbbells at your sides. Raise your arms out to the sides until they reach shoulder height, with a slight bend in your elbows. Lower with control. Avoid swinging.' },
  { pattern: /front.*raise/i, description: 'Hold the weight in front of your thighs. Raise it forward to shoulder height with arms nearly straight. Lower with control. Alternate arms or use both together.' },
  { pattern: /rear\s*delt.*raise|reverse\s*fly|reverse\s*flye/i, description: 'Bend at the hips with a flat back, arms hanging below. Raise the weights out to the sides, squeezing your rear delts and upper back. Lower with control.' },
  { pattern: /face\s*pull/i, description: 'Set a cable at face height with a rope attachment. Pull toward your face, separating the rope ends and externally rotating your shoulders. Squeeze your rear delts and upper back.' },
  { pattern: /upright\s*row/i, description: 'Hold the bar with a narrow grip in front of your thighs. Pull it up along your body to chin height, leading with your elbows. Lower with control.' },

  // === CHEST FLYES ===
  { pattern: /dumbbell\s*fly|dumbbell\s*flye/i, description: 'Lie on a bench holding dumbbells above your chest with a slight elbow bend. Lower the weights in a wide arc until you feel a stretch in your chest. Squeeze your chest to bring them back together.' },
  { pattern: /cable.*fly|cable.*flye|cable.*cross/i, description: 'Stand between cable stations with handles set at the desired height. Bring your hands together in front of you in a hugging motion, squeezing your chest. Return with control.' },
  { pattern: /pec\s*deck|butterfly/i, description: 'Sit in the machine with your arms on the pads at chest height. Bring the pads together in front of you, squeezing your chest. Return with control to feel the stretch.' },

  // === CURLS ===
  { pattern: /barbell\s*curl/i, description: 'Stand holding a barbell with an underhand grip at arm\'s length. Curl the bar toward your shoulders, keeping your elbows pinned to your sides. Lower with control.' },
  { pattern: /dumbbell.*curl|bicep\s*curl/i, description: 'Stand or sit holding dumbbells at your sides. Curl the weight toward your shoulder, keeping your elbow stationary. Squeeze your bicep at the top, then lower with control.' },
  { pattern: /hammer\s*curl/i, description: 'Hold dumbbells with a neutral (palms facing each other) grip. Curl toward your shoulders without rotating your wrists. This targets the brachialis and forearms in addition to biceps.' },
  { pattern: /preacher\s*curl/i, description: 'Rest your upper arms on the preacher pad. Curl the weight up, squeezing your biceps at the top. Lower with control, getting a full stretch at the bottom.' },
  { pattern: /concentration\s*curl/i, description: 'Sit with your elbow braced against your inner thigh. Curl the dumbbell toward your shoulder, squeezing at the top. Lower with control. The braced position isolates the bicep.' },
  { pattern: /incline.*curl/i, description: 'Sit on an incline bench with arms hanging straight down. Curl the dumbbells up, keeping your upper arms stationary. The incline puts a greater stretch on the biceps.' },
  { pattern: /cable.*curl/i, description: 'Stand facing a low cable with an appropriate attachment. Curl the handle toward your shoulders, keeping elbows stationary. Squeeze at the top and lower with control.' },
  { pattern: /ez[\s-]*bar\s*curl/i, description: 'Hold an EZ bar with an underhand grip on the angled portions. Curl toward your shoulders, keeping elbows pinned. The angled grip reduces wrist strain compared to a straight bar.' },

  // === TRICEPS ===
  { pattern: /tricep.*pushdown|push[\s-]*down.*tricep|cable.*pushdown/i, description: 'Stand facing a high cable with a bar or rope attachment. Push the weight down by extending your elbows, keeping upper arms stationary. Squeeze your triceps at the bottom.' },
  { pattern: /skull\s*crush|lying.*tricep.*extension/i, description: 'Lie on a bench holding the weight above your chest. Lower it toward your forehead by bending only at the elbows. Extend back to the start, keeping upper arms vertical.' },
  { pattern: /overhead.*tricep.*extension|cable.*rope.*overhead/i, description: 'Hold the weight overhead with arms extended. Lower it behind your head by bending at the elbows. Extend back to the start, keeping upper arms close to your ears.' },
  { pattern: /tricep.*kickback/i, description: 'Hinge at the hips with a flat back, upper arm parallel to your torso. Extend your forearm back until your arm is straight. Squeeze your tricep, then lower with control.' },
  { pattern: /dip.*tricep|tricep.*dip/i, description: 'Support yourself on parallel bars or a bench with arms straight. Lower by bending your elbows, keeping them close to your body. Press back up to lockout.' },
  { pattern: /bench\s*dip/i, description: 'Place your hands on a bench behind you, feet on the floor or elevated. Lower your body by bending your elbows to about 90 degrees. Press back up, focusing on your triceps.' },

  // === LEG CURLS / EXTENSIONS ===
  { pattern: /leg\s*extension/i, description: 'Sit in the machine with the pad on your lower shins. Extend your legs until straight, squeezing your quads at the top. Lower with control.' },
  { pattern: /leg\s*curl|hamstring\s*curl|lying\s*leg\s*curl/i, description: 'Lie face down on the machine with the pad behind your ankles. Curl your heels toward your glutes, squeezing your hamstrings. Lower with control.' },
  { pattern: /seated\s*leg\s*curl/i, description: 'Sit in the machine with the pad on the back of your lower legs. Curl your legs under the seat, squeezing your hamstrings. Return with control.' },

  // === LUNGES ===
  { pattern: /lunge/i, description: 'Step forward into a split stance. Lower your body until both knees are bent at roughly 90 degrees, keeping your torso upright. Push through your front heel to return to the start.' },
  { pattern: /step[\s-]*up/i, description: 'Stand facing a box or bench. Step up with one foot, driving through your heel to stand on top. Step down with control. Keep your torso upright throughout.' },

  // === CALF RAISES ===
  { pattern: /calf\s*raise|calf\s*press/i, description: 'Position the balls of your feet on the edge of a platform. Rise up onto your toes as high as possible, squeezing your calves. Lower slowly to get a full stretch at the bottom.' },

  // === HIP THRUSTS / BRIDGES ===
  { pattern: /hip\s*thrust/i, description: 'Sit on the floor with your upper back against a bench and a barbell across your hips. Drive through your heels to lift your hips until your body forms a straight line from shoulders to knees. Squeeze your glutes at the top.' },
  { pattern: /glute\s*bridge/i, description: 'Lie on your back with knees bent and feet flat. Drive through your heels to lift your hips, squeezing your glutes at the top. Lower with control.' },

  // === ABS ===
  { pattern: /crunch(?!.*reverse|.*oblique|.*cross)/i, description: 'Lie on your back with knees bent. Curl your upper body toward your knees, contracting your abs. Focus on lifting your shoulder blades off the ground. Lower with control.' },
  { pattern: /reverse\s*crunch/i, description: 'Lie on your back with knees bent at 90 degrees. Curl your hips off the floor toward your chest, contracting your lower abs. Lower with control.' },
  { pattern: /sit[\s-]*up/i, description: 'Lie on your back with knees bent and feet anchored. Curl your entire torso up to a seated position. Lower with control. Avoid pulling on your neck.' },
  { pattern: /hanging.*leg\s*raise|hanging.*raise/i, description: 'Hang from a bar with arms extended. Raise your legs until they are parallel to the floor (or higher), contracting your lower abs. Lower with control, avoiding swinging.' },
  { pattern: /plank(?!.*side)/i, description: 'Support your body on your forearms and toes in a straight line from head to heels. Brace your core and hold the position. Avoid letting your hips sag or pike up.' },
  { pattern: /side\s*plank/i, description: 'Lie on your side, propped up on one forearm. Lift your hips to form a straight line from head to feet. Hold, engaging your obliques. Keep your body in one plane.' },
  { pattern: /russian\s*twist/i, description: 'Sit with knees bent and feet off the floor, leaning back slightly. Rotate your torso side to side, touching the weight to the floor on each side. Keep your core braced throughout.' },
  { pattern: /mountain\s*climber/i, description: 'Start in a push-up position. Drive one knee toward your chest, then quickly switch legs in a running motion. Keep your hips low and core tight.' },
  { pattern: /ab\s*roll/i, description: 'Kneel with the roller in front of you. Roll forward, extending your body as far as you can while keeping your core tight and back flat. Pull back to the start using your abs.' },
  { pattern: /dead\s*bug/i, description: 'Lie on your back with arms extended toward the ceiling and knees bent at 90 degrees. Slowly extend one arm and the opposite leg, keeping your lower back pressed into the floor. Return and alternate.' },
  { pattern: /leg\s*raise/i, description: 'Lie on your back with legs straight. Raise your legs toward the ceiling, keeping them straight. Lower with control, stopping just before your feet touch the floor.' },
  { pattern: /flutter\s*kick/i, description: 'Lie on your back with legs extended. Lift your feet slightly off the floor and alternate kicking up and down in a small, controlled motion. Keep your lower back pressed into the floor.' },
  { pattern: /side\s*bend/i, description: 'Stand holding a weight in one hand. Bend sideways toward the weighted side, then use your obliques to pull yourself back upright. Keep your hips stationary.' },
  { pattern: /woodchop|wood\s*chop/i, description: 'Stand with feet shoulder-width apart. Rotate your torso to pull the cable or weight diagonally from high to low (or low to high), pivoting on your feet. Control the return.' },

  // === SHRUGS ===
  { pattern: /shrug/i, description: 'Hold the weight at arm\'s length. Elevate your shoulders straight up toward your ears, squeezing your traps at the top. Lower with control. Avoid rolling your shoulders.' },

  // === DIPS ===
  { pattern: /parallel\s*bar\s*dip|dip(?!.*bench|.*tricep)/i, description: 'Support yourself on parallel bars with arms straight. Lower your body by bending your elbows until your upper arms are parallel to the floor. Press back up to lockout.' },

  // === PUSH-UPS ===
  { pattern: /push[\s-]*up|pushup/i, description: 'Start in a plank position with hands slightly wider than shoulders. Lower your chest to the floor by bending your elbows. Push back up to full arm extension. Keep your body in a straight line throughout.' },

  // === GOOD MORNINGS ===
  { pattern: /good\s*morning/i, description: 'With a bar across your upper back, hinge at the hips with a slight knee bend. Lower your torso until nearly parallel to the floor, feeling the stretch in your hamstrings. Drive your hips forward to stand.' },

  // === BACK EXTENSIONS ===
  { pattern: /back\s*extension|hyperextension/i, description: 'Position yourself face down on the apparatus with your hips on the pad. Lower your torso toward the floor, then extend back up until your body is in a straight line. Squeeze your glutes and lower back at the top.' },

  // === FARMER WALKS ===
  { pattern: /farmer.*walk|farmer.*carry/i, description: 'Hold heavy weights at your sides with a firm grip. Walk with controlled steps, keeping your core braced, shoulders back, and posture tall. Maintain a steady pace.' },

  // === KETTLEBELL ===
  { pattern: /kettlebell\s*swing/i, description: 'Stand with feet wider than shoulders, kettlebell on the floor ahead. Hike the bell back between your legs, then drive your hips forward explosively to swing it to chest or overhead height. Control the descent.' },
  { pattern: /turkish\s*get[\s-]*up/i, description: 'Lie on your back holding a kettlebell overhead with one arm. Rise to standing through a series of controlled movements while keeping the weight locked out overhead. Reverse the steps to return to the floor.' },
  { pattern: /kettlebell\s*clean/i, description: 'Start with the kettlebell between your feet. Pull it up close to your body and rotate your hand to catch it in the rack position at your shoulder. Keep the bell close to avoid banging your forearm.' },
  { pattern: /kettlebell\s*snatch/i, description: 'Swing the kettlebell back between your legs, then drive your hips to pull it overhead in one fluid motion. Punch through at the top to lock it out. Control the descent back between your legs.' },

  // === OLYMPIC LIFTS ===
  { pattern: /clean\s*and\s*jerk/i, description: 'Pull the bar from the floor to your shoulders (the clean), then dip and drive to press it overhead (the jerk). This is a two-part explosive lift requiring coordination and power.' },
  { pattern: /clean\s*and\s*press/i, description: 'Clean the bar to your shoulders, then strict press it overhead without using leg drive. Lower with control to your shoulders between reps.' },
  { pattern: /power\s*clean/i, description: 'Pull the bar explosively from the floor, catching it at your shoulders in a partial squat. Stand to complete the lift. Focus on hip extension and fast elbows.' },
  { pattern: /snatch\b/i, description: 'Pull the bar from the floor to overhead in one explosive movement, catching it with arms locked out in a squat or power position. Stand to complete the lift.' },
  { pattern: /\bclean\b(?!.*jerk|.*press|.*shrug|.*deadlift|.*pull)/i, description: 'Pull the bar from the floor to your shoulders in one explosive movement, catching it in a front squat position. Stand to complete the lift.' },

  // === CARDIO ===
  { pattern: /treadmill/i, description: 'Walk or run on the treadmill at your chosen speed and incline. Maintain good posture with a slight forward lean. Swing your arms naturally.' },
  { pattern: /stationary.*bike|bicycling.*stationary/i, description: 'Adjust the seat height so your leg has a slight bend at the bottom of the pedal stroke. Pedal at your target cadence and resistance. Keep your core engaged.' },
  { pattern: /elliptical/i, description: 'Stand on the pedals and grip the handles. Move in a smooth, elliptical motion. Adjust resistance and incline to match your target intensity.' },
  { pattern: /rowing.*machine|ergometer/i, description: 'Sit with feet strapped in. Drive with your legs first, then lean back slightly and pull the handle to your lower chest. Return by extending arms, hinging forward, then bending knees.' },

  // === STRETCHES ===
  { pattern: /stretch/i, description: 'Move into the stretch position slowly until you feel gentle tension. Hold for 15-30 seconds, breathing deeply. Avoid bouncing. You should feel a stretch, not pain.' },
  { pattern: /smr$|foam\s*roll/i, description: 'Place the target muscle on the foam roller. Roll slowly back and forth, pausing on tender spots for 20-30 seconds. Apply moderate pressure using your body weight.' },
];

/**
 * Generate an accurate description for an exercise.
 * Returns null if no specific rule matches.
 */
export function getExerciseDescription(name: string): string | null {
  for (const rule of rules) {
    if (rule.pattern.test(name)) {
      return rule.description;
    }
  }
  return null;
}
