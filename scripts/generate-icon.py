#!/usr/bin/env python3
"""Generate a simple app icon for GymTracker."""

import struct
import zlib
import os

SIZE = 1024

def create_png(width, height, pixels):
    """Create a PNG file from raw RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter none
        for x in range(width):
            idx = (y * width + x) * 4
            raw += pixels[idx:idx+4]
    
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    
    return header + ihdr + idat + iend

def lerp(a, b, t):
    return int(a + (b - a) * t)

def draw_icon():
    pixels = bytearray(SIZE * SIZE * 4)
    
    # Colors
    bg = (17, 24, 39)        # #111827 - app dark background
    blue = (59, 130, 246)    # #3B82F6 - primary blue
    white = (255, 255, 255)
    
    cx, cy = SIZE // 2, SIZE // 2
    corner_r = int(SIZE * 0.22)  # rounded corner radius
    
    for y in range(SIZE):
        for x in range(SIZE):
            idx = (y * SIZE + x) * 4
            
            # Rounded rectangle background
            in_rect = True
            # Check corners
            if x < corner_r and y < corner_r:
                if (x - corner_r)**2 + (y - corner_r)**2 > corner_r**2:
                    in_rect = False
            elif x >= SIZE - corner_r and y < corner_r:
                if (x - (SIZE - corner_r))**2 + (y - corner_r)**2 > corner_r**2:
                    in_rect = False
            elif x < corner_r and y >= SIZE - corner_r:
                if (x - corner_r)**2 + (y - (SIZE - corner_r))**2 > corner_r**2:
                    in_rect = False
            elif x >= SIZE - corner_r and y >= SIZE - corner_r:
                if (x - (SIZE - corner_r))**2 + (y - (SIZE - corner_r))**2 > corner_r**2:
                    in_rect = False
            
            if not in_rect:
                pixels[idx:idx+4] = bytes([0, 0, 0, 0])
                continue
            
            # Background - dark with subtle radial gradient
            dist = ((x - cx)**2 + (y - cy)**2) ** 0.5
            max_dist = (cx**2 + cy**2) ** 0.5
            t = min(dist / max_dist, 1.0)
            r = lerp(30, 17, t)
            g = lerp(41, 24, t)
            b_val = lerp(59, 39, t)
            
            # Draw dumbbell icon
            drawn = False
            
            # Dumbbell parameters
            bar_y = cy
            bar_half_w = int(SIZE * 0.28)
            bar_h = int(SIZE * 0.045)
            
            plate_half_w = int(SIZE * 0.065)
            plate_half_h = int(SIZE * 0.18)
            plate_r = int(SIZE * 0.025)  # plate corner radius
            
            inner_plate_half_w = int(SIZE * 0.05)
            inner_plate_half_h = int(SIZE * 0.13)
            
            plate_offset = int(SIZE * 0.2)
            
            # Central bar
            if abs(y - bar_y) <= bar_h and abs(x - cx) <= bar_half_w:
                pixels[idx:idx+4] = bytes([white[0], white[1], white[2], 255])
                drawn = True
            
            if not drawn:
                # Left plate (outer)
                px = cx - plate_offset
                in_plate = (abs(x - px) <= plate_half_w and abs(y - bar_y) <= plate_half_h)
                # Round corners of plate
                if in_plate:
                    lx = px - plate_half_w
                    rx = px + plate_half_w
                    ty = bar_y - plate_half_h
                    by_ = bar_y + plate_half_h
                    if x < lx + plate_r and y < ty + plate_r:
                        if (x - (lx + plate_r))**2 + (y - (ty + plate_r))**2 > plate_r**2:
                            in_plate = False
                    elif x > rx - plate_r and y < ty + plate_r:
                        if (x - (rx - plate_r))**2 + (y - (ty + plate_r))**2 > plate_r**2:
                            in_plate = False
                    elif x < lx + plate_r and y > by_ - plate_r:
                        if (x - (lx + plate_r))**2 + (y - (by_ - plate_r))**2 > plate_r**2:
                            in_plate = False
                    elif x > rx - plate_r and y > by_ - plate_r:
                        if (x - (rx - plate_r))**2 + (y - (by_ - plate_r))**2 > plate_r**2:
                            in_plate = False
                if in_plate:
                    pixels[idx:idx+4] = bytes([blue[0], blue[1], blue[2], 255])
                    drawn = True
                
                # Right plate (outer)
                if not drawn:
                    px = cx + plate_offset
                    in_plate = (abs(x - px) <= plate_half_w and abs(y - bar_y) <= plate_half_h)
                    if in_plate:
                        lx = px - plate_half_w
                        rx = px + plate_half_w
                        ty = bar_y - plate_half_h
                        by_ = bar_y + plate_half_h
                        if x < lx + plate_r and y < ty + plate_r:
                            if (x - (lx + plate_r))**2 + (y - (ty + plate_r))**2 > plate_r**2:
                                in_plate = False
                        elif x > rx - plate_r and y < ty + plate_r:
                            if (x - (rx - plate_r))**2 + (y - (ty + plate_r))**2 > plate_r**2:
                                in_plate = False
                        elif x < lx + plate_r and y > by_ - plate_r:
                            if (x - (lx + plate_r))**2 + (y - (by_ - plate_r))**2 > plate_r**2:
                                in_plate = False
                        elif x > rx - plate_r and y > by_ - plate_r:
                            if (x - (rx - plate_r))**2 + (y - (by_ - plate_r))**2 > plate_r**2:
                                in_plate = False
                    if in_plate:
                        pixels[idx:idx+4] = bytes([blue[0], blue[1], blue[2], 255])
                        drawn = True
                
                # Left inner plate
                if not drawn:
                    px = cx - plate_offset - plate_half_w - inner_plate_half_w - 8
                    if abs(x - px) <= inner_plate_half_w and abs(y - bar_y) <= inner_plate_half_h:
                        pixels[idx:idx+4] = bytes([blue[0], blue[1], blue[2], 200])
                        drawn = True
                
                # Right inner plate
                if not drawn:
                    px = cx + plate_offset + plate_half_w + inner_plate_half_w + 8
                    if abs(x - px) <= inner_plate_half_w and abs(y - bar_y) <= inner_plate_half_h:
                        pixels[idx:idx+4] = bytes([blue[0], blue[1], blue[2], 200])
                        drawn = True
            
            if not drawn:
                pixels[idx:idx+4] = bytes([r, g, b_val, 255])
    
    return bytes(pixels)

print("Generating 1024x1024 app icon...")
pixels = draw_icon()
png_data = create_png(SIZE, SIZE, pixels)

# Write to the iOS asset catalog
icon_path = os.path.join(os.path.dirname(__file__), '..', 'ios', 'GymTracker', 'Images.xcassets', 'AppIcon.appiconset', 'App-Icon-1024x1024@1x.png')
with open(icon_path, 'wb') as f:
    f.write(png_data)
print(f"Written to {icon_path}")

# Also save a copy at project root for reference
root_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icon.png')
with open(root_path, 'wb') as f:
    f.write(png_data)
print(f"Also saved to {root_path}")
print("Done!")
