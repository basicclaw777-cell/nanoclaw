#!/usr/bin/env python3
import os
import math
import neat
import pygame
from fighter import Fighter
from world import World

# Layout
WIN_W, WIN_H = 1200, 750
RING_W = 700
RING_CX, RING_CY = RING_W // 2, RING_W // 2 + 25
RING_CENTER = (RING_CX, RING_CY)
RING_RADIUS = 280

# Colors
BG = (13, 17, 23)
FLOOR = (22, 27, 34)
ROPE = (180, 185, 190)
BLUE = (77, 171, 247)
RED = (255, 107, 107)
GOLD = (247, 180, 8)
TXT = (201, 209, 217)
DIM = (110, 120, 130)

# State
gen_num = 0
best_ever = 0.0
show_net = True
running = True
screen = None
clock = None


def init_display():
    global screen, clock
    pygame.init()
    screen = pygame.display.set_mode((WIN_W, WIN_H))
    pygame.display.set_caption('Boxing Sim — Matador vs Bull')
    clock = pygame.time.Clock()


def pump_events():
    global running, show_net
    action = None
    for ev in pygame.event.get():
        if ev.type == pygame.QUIT:
            running = False
            action = 'quit'
        elif ev.type == pygame.KEYDOWN:
            if ev.key == pygame.K_q:
                running = False
                action = 'quit'
            elif ev.key == pygame.K_v:
                show_net = not show_net
            elif ev.key == pygame.K_SPACE:
                action = 'skip'
    return action


# ── drawing ──────────────────────────────────────────────

def draw_ring(s):
    pygame.draw.circle(s, FLOOR, RING_CENTER, RING_RADIUS)
    pygame.draw.circle(s, ROPE, RING_CENTER, RING_RADIUS, 2)
    pygame.draw.circle(s, (35, 42, 50), RING_CENTER, 4)


def draw_fighter(s, f, opp, color):
    x, y = int(f.x), int(f.y)
    if f.is_blocking:
        pygame.draw.circle(s, (60, 180, 80), (x, y), f.RADIUS + 5, 2)
    pygame.draw.circle(s, color, (x, y), f.RADIUS)
    pygame.draw.circle(s, (220, 220, 220), (x, y), f.RADIUS, 1)
    if f.punch_type > 0:
        a = f.angle_to(opp)
        total = f.PUNCH_WINDUP + f.PUNCH_ACTIVE
        prog = min(1.0, f.punch_frame / max(1, total))
        reach = f.get_punch_reach() * prog
        px = x + int(math.cos(a) * reach)
        py = y + int(math.sin(a) * reach)
        if f.is_punch_active():
            pygame.draw.circle(s, (255, 230, 50), (px, py), 6)
            pygame.draw.line(s, (255, 200, 50), (x, y), (px, py), 2)
        else:
            pygame.draw.circle(s, (140, 130, 60), (px, py), 3)


def draw_bar(s, x, y, w, h, val, mx, color):
    pygame.draw.rect(s, (35, 40, 50), (x, y, w, h))
    fw = max(0, int(w * min(1, val / mx)))
    if fw:
        pygame.draw.rect(s, color, (x, y, fw, h))


def draw_network(s, genome, config, rx, ry, rw, rh):
    pygame.draw.rect(s, (18, 22, 30), (rx, ry, rw, rh))
    pygame.draw.rect(s, (45, 50, 60), (rx, ry, rw, rh), 1)

    ik = config.genome_config.input_keys
    ok = config.genome_config.output_keys
    ok_set = set(ok)
    hk = sorted(k for k in genome.nodes if k not in ok_set)

    inames = ['dist', 'close', 'stam', 'wallB', 'wallL', 'wallR', 'oppP', 'HP']
    onames = ['fwd/bk', 'circle', 'jab', 'cross', 'block']

    mx_pad, my_pad = 60, 18
    pos = {}

    for i, k in enumerate(ik):
        t = i / max(1, len(ik) - 1)
        pos[k] = (rx + mx_pad, int(ry + my_pad + t * (rh - 2 * my_pad)))
    for i, k in enumerate(ok):
        t = i / max(1, len(ok) - 1)
        pos[k] = (rx + rw - mx_pad, int(ry + my_pad + t * (rh - 2 * my_pad)))
    for i, k in enumerate(hk):
        t = i / max(1, len(hk) - 1) if len(hk) > 1 else 0.5
        pos[k] = (rx + rw // 2, int(ry + my_pad + t * (rh - 2 * my_pad)))

    for (a, b), conn in genome.connections.items():
        if conn.enabled and a in pos and b in pos:
            w = conn.weight
            c = (100, 200, 100) if w > 0 else (200, 100, 100)
            th = max(1, min(4, int(abs(w) * 1.2)))
            alpha = min(1.0, abs(w) * 0.25 + 0.12)
            lc = tuple(int(v * alpha) for v in c)
            pygame.draw.line(s, lc, pos[a], pos[b], th)

    fn = pygame.font.Font(None, 17)
    for i, k in enumerate(ik):
        pygame.draw.circle(s, (170, 180, 190), pos[k], 5)
        s.blit(fn.render(inames[i], True, DIM),
               (pos[k][0] - mx_pad + 8, pos[k][1] - 6))
    for i, k in enumerate(ok):
        pygame.draw.circle(s, (170, 180, 190), pos[k], 5)
        s.blit(fn.render(onames[i], True, DIM),
               (pos[k][0] + 8, pos[k][1] - 6))
    for k in hk:
        pygame.draw.circle(s, (130, 140, 150), pos[k], 3)


def draw_hud(s, gn, fit, mat, bull, frame):
    px = RING_W + 12
    f1 = pygame.font.Font(None, 28)
    f2 = pygame.font.Font(None, 21)
    f3 = pygame.font.Font(None, 17)
    y = 10

    s.blit(f1.render(f'GEN {gn}', True, GOLD), (px, y))
    y += 28
    s.blit(f2.render(f'Fitness {fit:.0f}   Best {best_ever:.0f}', True, TXT), (px, y))
    y += 20
    s.blit(f3.render(f'Frame {frame}/{World.FIGHT_DURATION}', True, DIM), (px, y))
    y += 26

    s.blit(f2.render('MATADOR', True, BLUE), (px, y))
    y += 18
    draw_bar(s, px, y, 190, 9, mat.health, 100, BLUE)
    s.blit(f3.render(f'{mat.health:.0f}', True, TXT), (px + 195, y))
    y += 13
    draw_bar(s, px, y, 190, 9, mat.stamina, Fighter.MAX_STAMINA, (70, 190, 110))
    s.blit(f3.render(f'{mat.stamina:.0f}', True, TXT), (px + 195, y))
    y += 16
    s.blit(f3.render(
        f'Hit:{mat.punches_landed} Dodge:{mat.punches_dodged} Ctr:{mat.counter_punches}',
        True, DIM), (px, y))
    y += 22

    s.blit(f2.render('BULL', True, RED), (px, y))
    y += 18
    draw_bar(s, px, y, 190, 9, bull.health, 100, RED)
    s.blit(f3.render(f'{bull.health:.0f}', True, TXT), (px + 195, y))
    y += 13
    draw_bar(s, px, y, 190, 9, bull.stamina, Fighter.MAX_STAMINA, (70, 190, 110))
    y += 16
    s.blit(f3.render(
        f'Hit:{bull.punches_landed} Thrown:{bull.punches_thrown}',
        True, DIM), (px, y))
    y += 26

    # Scouting
    s.blit(f2.render('SCOUTING', True, GOLD), (px, y))
    y += 20
    tc = mat.circle_left_count + mat.circle_right_count
    if tc > 0:
        lp = mat.circle_left_count * 100 // tc
        s.blit(f3.render(f'Circle L:{lp}%  R:{100 - lp}%', True, DIM), (px, y))
        y += 16
    s.blit(f3.render(
        f'Dmg out:{mat.damage_dealt:.0f}  in:{mat.damage_taken:.0f}',
        True, DIM), (px, y))
    y += 16
    if mat.punches_thrown > 0:
        acc = mat.punches_landed * 100 // max(1, mat.punches_thrown)
        s.blit(f3.render(f'Accuracy: {acc}%', True, DIM), (px, y))
        y += 16
    if mat.punches_dodged > 0:
        cr = mat.counter_punches * 100 // max(1, mat.punches_dodged)
        s.blit(f3.render(f'Counter rate: {cr}%', True, DIM), (px, y))

    s.blit(f3.render('SPACE skip   V net   Q quit', True, (55, 60, 70)),
           (px, WIN_H - 22))


# ── simulation ───────────────────────────────────────────

def run_headless(net):
    m = Fighter(RING_CX, RING_CY + 100, 'matador')
    b = Fighter(RING_CX, RING_CY - 100, 'bull')
    w = World(RING_CENTER, RING_RADIUS)
    for frame in range(World.FIGHT_DURATION):
        inp = m.sense(b, w.center, w.radius)
        out = net.activate(inp)
        m.apply_action(out, b)
        b.apply_action(w.scripted_bull_ai(b, m, frame), m)
        w.update(m, b, frame)
        if m.health <= 0 or b.health <= 0:
            break
    return w.calculate_fitness(m)


def replay_best(genome, config, gn):
    net = neat.nn.FeedForwardNetwork.create(genome, config)
    m = Fighter(RING_CX, RING_CY + 100, 'matador')
    b = Fighter(RING_CX, RING_CY - 100, 'bull')
    w = World(RING_CENTER, RING_RADIUS)

    for frame in range(World.FIGHT_DURATION):
        ev = pump_events()
        if ev == 'quit':
            raise SystemExit
        if ev == 'skip':
            break

        inp = m.sense(b, w.center, w.radius)
        out = net.activate(inp)
        m.apply_action(out, b)
        b.apply_action(w.scripted_bull_ai(b, m, frame), m)
        w.update(m, b, frame)

        # Render
        screen.fill(BG)
        draw_ring(screen)
        draw_fighter(screen, b, m, RED)
        draw_fighter(screen, m, b, BLUE)
        pygame.draw.line(screen, (35, 40, 50), (RING_W, 0), (RING_W, WIN_H))

        if show_net:
            draw_network(screen, genome, config,
                         RING_W + 5, 380, WIN_W - RING_W - 10, 360)

        fit = w.calculate_fitness(m)
        draw_hud(screen, gn, fit, m, b, frame)
        pygame.display.flip()
        clock.tick(60)

        if m.health <= 0 or b.health <= 0:
            pygame.time.wait(600)
            break


# ── NEAT loop ────────────────────────────────────────────

def eval_genomes(genomes, config):
    global gen_num, best_ever, running
    gen_num += 1

    screen.fill(BG)
    fn = pygame.font.Font(None, 30)
    txt = fn.render(f'GEN {gen_num} — evolving {len(genomes)} fighters...', True, GOLD)
    screen.blit(txt, (WIN_W // 2 - txt.get_width() // 2, WIN_H // 2))
    pygame.display.flip()

    for ev in pygame.event.get():
        if ev.type == pygame.QUIT:
            running = False
            raise SystemExit

    best_g, best_f = None, -1.0

    for gid, genome in genomes:
        if not running:
            genome.fitness = 0.0
            continue
        net = neat.nn.FeedForwardNetwork.create(genome, config)
        genome.fitness = run_headless(net)
        if genome.fitness > best_f:
            best_f = genome.fitness
            best_g = genome

    if best_f > best_ever:
        best_ever = best_f

    if best_g and running:
        replay_best(best_g, config, gen_num)


def main():
    init_display()
    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'neat-config.txt')
    config = neat.Config(
        neat.DefaultGenome, neat.DefaultReproduction,
        neat.DefaultSpeciesSet, neat.DefaultStagnation,
        cfg_path)

    pop = neat.Population(config)
    pop.add_reporter(neat.StdOutReporter(True))
    pop.add_reporter(neat.StatisticsReporter())

    try:
        winner = pop.run(eval_genomes, 500)
        print(f'\nBest genome fitness: {winner.fitness:.1f}')
    except (SystemExit, KeyboardInterrupt):
        pass
    finally:
        pygame.quit()


if __name__ == '__main__':
    main()
