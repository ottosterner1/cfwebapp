from flask import current_app
from app import create_app, db
from app.models import Report, TeachingPeriod
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from io import BytesIO
import os
import traceback
import json
import random
import shutil
from random import uniform
from datetime import datetime
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

class EnhancedWiltonReportGenerator:
    def __init__(self, config_path):
        """Initialize the report generator with configuration."""

        if not os.path.exists(config_path):
            raise FileNotFoundError(
                f"Config file not found at: {config_path}\n"
                f"Current directory: {os.getcwd()}\n"
                f"Directory contents: {os.listdir(os.path.dirname(config_path))}"
            )
            
        with open(config_path, 'r') as f:
            self.config = json.load(f)
       
        # Get base directory for fonts
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        fonts_dir = os.path.join(base_dir, 'static', 'fonts')
        
        # Register handwriting font
        try:
            pdfmetrics.registerFont(TTFont('Handwriting', os.path.join(fonts_dir, 'caveat.ttf')))
            self.font_name = 'Handwriting'
        except:
            print("Warning: Handwriting font not found, falling back to Helvetica")
            self.font_name = 'Helvetica-Bold'

    def is_school_group(self, group_name):
        """Check if this is a school group that should use the schools letter."""
        return 'school' in group_name.lower()

    def get_schools_letter_path(self):
        """Get the path to the schools letter PDF."""
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        template_dir = os.path.join(base_dir, 'app', 'static', 'pdf_templates')
        return os.path.join(template_dir, 'wilton_schools_letter.pdf')

    def generate_schools_letter(self, output_path):
        """Generate a schools letter by copying the template."""
        schools_letter_path = self.get_schools_letter_path()
        
        if not os.path.exists(schools_letter_path):
            raise FileNotFoundError(f"Schools letter template not found at: {schools_letter_path}")
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Simply copy the schools letter to the output location
        shutil.copy2(schools_letter_path, output_path)
            
    def get_template_path(self, group_name):
        """
        Get the correct template path based on group name.
        Finds any template that contains a substring of the group name.
        """
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        template_dir = os.path.join(base_dir, 'app', 'static', 'pdf_templates')
        
        # Check if the directory exists
        if not os.path.exists(template_dir):
            return None
        
        # Normalize the group name for comparison (lowercase, no spaces)
        normalized_group = group_name.lower().replace(' ', '_')
        
        # Get all template files in the directory
        template_files = [f for f in os.listdir(template_dir) if f.startswith('wilton_') and f.endswith('_report.pdf')]
        
        # Sort templates by length (descending) to prefer more specific matches
        template_files.sort(key=len, reverse=True)
        
        for template_file in template_files:
            # Extract the middle part between 'wilton_' and '_report.pdf'
            template_key = template_file[len('wilton_'):-len('_report.pdf')]
            
            # Check if this template key appears in the normalized group name
            if template_key in normalized_group:
                return os.path.join(template_dir, template_file)
        
        # If no match found, return None
        return None

    def get_group_config(self, group_name):
        """
        Get the configuration for a specific group.
        Tries to find the best matching config for the group name.
        """
        # First try exact match
        if group_name in self.config:
            return self.config[group_name]
        
        # Normalize the group name for comparison
        normalized_group = group_name.lower().replace(' ', '_')
        
        # Create a list of config keys sorted by length (descending) to prefer more specific matches
        config_keys = sorted(self.config.keys(), key=len, reverse=True)
        
        # Look for partial matches
        for config_key in config_keys:
            normalized_key = config_key.lower().replace(' ', '_')
            
            # Check if the normalized key is in the normalized group name
            if normalized_key in normalized_group:
                return self.config[config_key]
            
            # Also check the reverse - if the group name is in the config key
            # This can help with cases where the config is more specific than the group name
            if normalized_group in normalized_key:
                return self.config[config_key]
        
        # If no match found, return None
        return None
        
    def draw_diagonal_text(self, c, text, x, y, angle=23):
        """Draw text at a specified angle with handwriting style."""
        c.saveState()
        c.translate(x, y)
        c.rotate(angle)
        
        # Base font size with slight variation
        base_size = 14
        font_size = base_size + uniform(-0.5, 0.5)
        
        c.setFont(self.font_name, font_size)
        
        # Add slight random rotation for each character
        chars = list(text)
        current_x = 0
        for char in chars:
            char_angle = uniform(-2, 2)  # Slight random rotation
            c.saveState()
            c.rotate(char_angle)
            c.drawString(current_x, uniform(-0.5, 0.5), char)  # Slight vertical variation
            c.restoreState()
            current_x += c.stringWidth(char, self.font_name, font_size) * 0.95  # Slightly tighter spacing
            
        c.restoreState()

    def draw_checkbox(self, canvas, x, y, checked=False, size=8):
        """Draw a more natural-looking checkbox tick with a handwriting style and debug font usage."""
        if checked:
            canvas.saveState()

            # Debugging: Check and set the custom font
            try:
                canvas.setFont(self.font_name, size)
            except Exception as e:
                canvas.setFont('Helvetica', size)

            # Handwritten-style tick path with minor randomness
            
            tick_color = Color(0, 0, 0, alpha=0.8)  # Slightly transparent black
            canvas.setStrokeColor(tick_color)
            canvas.setLineWidth(0.8)  # Thinner line for a more natural look

            # Add randomness to mimic handwriting
            def jitter(value, max_jitter=0.5):
                return value + random.uniform(-max_jitter, max_jitter)

            # Draw a tick path with irregularities
            p = canvas.beginPath()
            p.moveTo(jitter(x - size / 2), jitter(y - size / 4))
            p.curveTo(
                jitter(x - size / 3), jitter(y - size / 3),  # Control point 1
                jitter(x - size / 4), jitter(y - size / 2),  # Control point 2
                jitter(x - size / 6), jitter(y - size / 2)   # End point of the first curve
            )
            p.curveTo(
                jitter(x), jitter(y - size / 3),             # Control point 1
                jitter(x + size / 3), jitter(y + size / 3),  # Control point 2
                jitter(x + size / 2), jitter(y + size / 2)   # End point
            )
            canvas.drawPath(p)

            # Optionally, use a handwritten tick symbol
            label_offset = size  # Offset for text next to the checkbox
            canvas.drawString(x + label_offset, y, "✓")  # Ensure font is handwriting-style

            canvas.restoreState()

    def draw_next_term_checkboxes(self, c, page2_coords, next_term):
        """Draw checkboxes for the next term options."""
        next_term_coords = page2_coords.get('next_term')

        if next_term_coords:
            # Mapping terms to their respective x-coordinates
            term_to_x = {
                'Autumn': next_term_coords['autumn_x'],
                'Spring': next_term_coords['spring_x'],
                'Summer': next_term_coords['summer_x']
            }
            y = next_term_coords['y']

            # Draw the checkbox for the determined term
            if next_term in term_to_x:
                self.draw_checkbox(c, term_to_x[next_term], y, True)

    def get_next_term(self, current_term):
        """Determine the next term based on the current term."""
        if 'Autumn' in current_term:
            return 'Spring'
        elif 'Spring' in current_term:
            return 'Summer'
        elif 'Summer' in current_term:
            return 'Autumn'
        return current_term

    def draw_group_recommendation_checkbox(self, c, data, rec_coords):
        """
        Draw the group recommendation checkbox based on the recommended group.
        Uses a flexible matching approach to find the right checkbox coordinates.
        """
        recommended_group = data.get('recommended_group')
        # If no recommendation, don't draw any tick
        if not recommended_group:
            return
        
        # Normalize the recommended group name
        normalized_group = recommended_group.lower().replace(' ', '_')
        
        # Look for the most specific matching coordinate in rec_coords
        best_match = None
        best_match_length = 0
        
        for coord_key in rec_coords:
            # Only consider keys that end with '_x' to get coordinate keys
            if not coord_key.endswith('_x'):
                continue
                
            # Extract the group identifier from the coordinate key (remove '_x')
            group_id = coord_key[:-2]
            
            # Check if this identifier is in the normalized group name
            if group_id in normalized_group and len(group_id) > best_match_length:
                best_match = group_id
                best_match_length = len(group_id)
        
        # If we found a match, draw the checkbox
        if best_match:
            self.draw_checkbox(c, rec_coords[f'{best_match}_x'], rec_coords['y'], True)

    def generate_page_overlay(self, data, config, page_num):
        """Generate a single page overlay with improved skill matching that's robust to text encoding differences."""
        packet = BytesIO()
        c = canvas.Canvas(packet, pagesize=A4)
        c.setFont("Helvetica-BoldOblique", 12)
        
        if page_num == 1:
            # Front page - add diagonal text fields
            coords = config.get('page1', {})
            
            # Only draw fields that exist in both config and data
            field_mappings = {
                'player_name': 'player_name',
                'coach_name': 'coach_name',
                'term': 'term',
                'group': 'group'
            }
            
            for field, data_key in field_mappings.items():
                if field in coords and data_key in data:
                    self.draw_diagonal_text(c, data[data_key], 
                                            coords[field][0], 
                                            coords[field][1])
        
        elif page_num == 2:
            # Report card page - add checkboxes only if sections exist
            sections = config.get('page2', {}).get('sections', {})
            content = data.get('content', {})
            
            # Process each section that exists in both config and content
            for section_name, section_coords in sections.items():
                if section_name in content:
                    # Use skills_order if defined, otherwise fall back to default behavior
                    skills_order = section_coords.get('skills_order', [])
                    
                    if skills_order:
                        # Process each skill in the defined order
                        for i, skill_text in enumerate(skills_order):
                            # Calculate position based on index in the ordered list
                            y_pos = section_coords['start_y'] - (i * section_coords['spacing'])
                            
                            # Normalized lookup instead of direct match
                            matched_key = None
                            skill_value = None
                            
                            # Normalize the config skill text for comparison (remove all special chars)
                            norm_skill_text = ''.join(c.lower() for c in skill_text if c.isalnum() or c.isspace()).strip()
                            
                            # Look for a matching skill in the content
                            for content_key, content_value in content[section_name].items():
                                # Normalize the content key for comparison
                                norm_content_key = ''.join(c.lower() for c in content_key if c.isalnum() or c.isspace()).strip()
                                
                                # Check if the normalized versions match
                                if norm_skill_text == norm_content_key:
                                    matched_key = content_key
                                    skill_value = content_value
                                    break
                            
                            # If we found a match, draw the checkbox
                            if matched_key and skill_value:
                                if skill_value == 'Yes':
                                    self.draw_checkbox(c, section_coords['yes_x'], y_pos, True)
                                elif skill_value == 'Nearly':
                                    self.draw_checkbox(c, section_coords['nearly_x'], y_pos, True)
                                elif skill_value == 'Not Yet':
                                    self.draw_checkbox(c, section_coords['not_yet_x'], y_pos, True)
                    else:
                        # Fall back to original implementation if no skills_order defined
                        y_pos = section_coords['start_y']
                        for skill_value in content[section_name].values():
                            if skill_value == 'Yes':
                                self.draw_checkbox(c, section_coords['yes_x'], y_pos, True)
                            elif skill_value == 'Nearly':
                                self.draw_checkbox(c, section_coords['nearly_x'], y_pos, True)
                            elif skill_value == 'Not Yet':
                                self.draw_checkbox(c, section_coords['not_yet_x'], y_pos, True)
                            y_pos -= section_coords['spacing']
            
            # Add group recommendation checkbox
            rec_coords = config.get('page2', {}).get('group_recommendation')
            if rec_coords:
                self.draw_group_recommendation_checkbox(c, data, rec_coords)

            # Add next term checkboxes
            next_term_coords = config.get('page2', {}).get('next_term')
            if next_term_coords:
                current_term = data.get('term', '')
                next_term = self.get_next_term(current_term)
                self.draw_next_term_checkboxes(c, config['page2'], next_term)

            # Add teaching period dates at the bottom
            teaching_period = data.get('teaching_period')
            if teaching_period:
                # Format dates as DD MM
                date_coords = config.get('page2', {}).get('teaching_period_dates', {})
                if teaching_period.get('next_period_start_date') and 'next_term_start' in date_coords:
                    next_start = datetime.strptime(teaching_period['next_period_start_date'], '%Y-%m-%d')
                    day = next_start.strftime('%d')
                    month = next_start.strftime('%m')
                    coords = date_coords['next_term_start']
                    c.setFont(self.font_name, 20)
                    
                    # Draw each digit of the day
                    c.drawString(coords['x'], coords['y'], day[0])
                    c.drawString(coords['x'] + 20, coords['y'], day[1])
                    
                    # Draw each digit of the month
                    c.drawString(coords['x'] + 57, coords['y'], month[0])
                    c.drawString(coords['x'] + 75, coords['y'], month[1])

                if teaching_period.get('bookings_open_date') and 'bookings_open' in date_coords:
                    bookings_open = datetime.strptime(teaching_period['bookings_open_date'], '%Y-%m-%d')
                    day = bookings_open.strftime('%d')
                    month = bookings_open.strftime('%m')
                    coords = date_coords['bookings_open']
                    c.setFont(self.font_name, 20)
                    
                    # Draw each digit of the day
                    c.drawString(coords['x'], coords['y'], day[0])
                    c.drawString(coords['x'] + 20, coords['y'], day[1])
                    
                    # Draw each digit of the month
                    c.drawString(coords['x'] + 57, coords['y'], month[0])
                    c.drawString(coords['x'] + 75, coords['y'], month[1])
        
        c.save()
        packet.seek(0)
        return PdfReader(packet)

    def _generate_generic_report(self, data, output_path):
        """Generate a generic report when no template/config exists."""
        from app.utils.report_generator import create_single_report_pdf
        
        try:
            # Create PDF in memory first
            pdf_buffer = BytesIO()
            report = data['report'] if 'report' in data else None
            
            if report is None:
                raise ValueError("Report object is required for generic report generation")

            create_single_report_pdf(report, pdf_buffer)
            pdf_buffer.seek(0)  # Reset buffer position
            
            # Ensure the content is not empty
            content = pdf_buffer.getvalue()
            if not content:
                raise ValueError("Generated PDF content is empty")
            
            # Save to file
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(content)
                
            # Verify file was written
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                raise ValueError(f"Failed to write PDF to {output_path}")
            
        except Exception as e:
            print(f"Error generating generic report: {str(e)}")
            raise  # Re-raise the exception to be caught by the caller

    def generate_report(self, template_path, output_path, data):
        """Generate a filled report PDF."""
        
        # Check if this is a school group - if so, just use the schools letter
        if self.is_school_group(data['group']):
            self.generate_schools_letter(output_path)
            return
        
        # Original logic for non-school groups
        group_config = self.get_group_config(data['group'])
        
        # Fall back to generic report if no template or config exists
        if not os.path.exists(template_path) or not group_config:
            return self._generate_generic_report(data, output_path)
        
        # Original Wilton report generation code remains the same
        template = PdfReader(open(template_path, "rb"))
        output = PdfWriter()
        
        for page_num in range(len(template.pages)):
            template_page = template.pages[page_num]
            overlay = self.generate_page_overlay(data, group_config, page_num + 1)
            template_page.merge_page(overlay.pages[0])
            output.add_page(template_page)
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as output_file:
            output.write(output_file)

    @classmethod
    def batch_generate_reports(cls, period_id, config_path=None):
        """Generate reports for all completed reports in a teaching period."""
        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, 'utils', 'wilton_group_config.json')
        
        generator = cls(config_path)
        
        # Get all completed reports for the period with related data
        reports = Report.query.filter_by(teaching_period_id=period_id)\
            .join(Report.programme_player)\
            .join(Report.teaching_period)\
            .options(
                db.joinedload(Report.recommended_group),
                db.joinedload(Report.teaching_period)
            )\
            .all()
        
        if not reports:
            return {
                'success': 0,
                'errors': 0,
                'error_details': ['No reports found for this period'],
                'output_directory': None
            }

        # Get period name for the main folder
        period_name = reports[0].teaching_period.name.replace(' ', '_').lower()
        
        # Set up base output directory
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        reports_dir = os.path.join(base_dir, 'instance', 'reports')
        period_dir = os.path.join(reports_dir, f'reports-{period_name}')
        
        generated_reports = []
        errors = []
        
        for report in reports:
            try:
                # Create group-specific directory with time slot and day
                group_name = report.tennis_group.name.replace(' ', '_').lower()

                if report.programme_player and report.programme_player.group_time:
                    time = report.programme_player.group_time
                    start_time = time.start_time.strftime('%I%M%p').lower()
                    end_time = time.end_time.strftime('%I%M%p').lower()
                    day = time.day_of_week.value.lower()
                    group_dir = f"{group_name}_{day}_{start_time}_{end_time}_reports"
                else:
                    group_dir = f"{group_name}_reports"
                
                full_group_dir = os.path.join(period_dir, group_dir)
                os.makedirs(full_group_dir, exist_ok=True)
                
                # Prepare output path with standardized naming
                student_name = report.student.name.replace(' ', '_').lower()
                term_name = report.teaching_period.name.replace(' ', '_').lower()
                filename = f"{student_name}_{group_name}_{term_name}_report.pdf"
                output_path = os.path.join(full_group_dir, filename)
                
                # Prepare report data including teaching period dates
                data = {
                    'player_name': report.student.name,
                    'coach_name': report.coach.name,
                    'term': report.teaching_period.name,
                    'group': report.tennis_group.name,
                    'content': report.content,
                    'recommended_group': report.recommended_group.name if report.recommended_group else None,
                    'teaching_period': {
                        'next_period_start_date': report.teaching_period.next_period_start_date.strftime('%Y-%m-%d') if report.teaching_period.next_period_start_date else None,
                        'bookings_open_date': report.teaching_period.bookings_open_date.strftime('%Y-%m-%d') if report.teaching_period.bookings_open_date else None
                    },
                    'report': report 
                }
                
                # Handle school groups differently - just generate the schools letter
                if generator.is_school_group(report.tennis_group.name):
                    generator.generate_schools_letter(output_path)
                else:
                    # Get template path for this group
                    template_path = generator.get_template_path(report.tennis_group.name)
                    
                    # Generate the report (either Wilton template or generic)
                    if template_path is None:
                        try:
                            generator._generate_generic_report(data, output_path)
                            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                                raise ValueError(f"Generated file is empty or missing: {output_path}")
                        except Exception as e:
                            errors.append(f"Error generating generic report for {report.student.name}: {str(e)}")
                            print(f"Error generating generic report: {str(e)}")
                            continue
                    else:
                        generator.generate_report(template_path, output_path, data)
                        
                generated_reports.append(output_path)
                
            except Exception as e:
                errors.append(f"Error generating report for {report.student.name}: {str(e)}")
                
        return {
            'success': len(generated_reports),
            'errors': len(errors),
            'error_details': errors,
            'output_directory': period_dir
        }

    @classmethod
    def generate_single_report(cls, report_id, output_dir=None, config_path=None):
        """Generate a report for a single specific report ID."""
        if config_path is None:
            # Fix path resolution to look in app/utils
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, 'app', 'utils', 'wilton_group_config.json')
            
        generator = cls(config_path)
        
        # Get the report
        report = Report.query.get(report_id)
        if not report:
            raise ValueError(f"Report not found with ID: {report_id}")
            
        # Set up output directory
        if output_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_dir = os.path.join(base_dir, 'instance', 'generated_reports', timestamp)
            
        os.makedirs(output_dir, exist_ok=True)
        
        # Prepare output path
        filename = f"{report.student.name}_{report.tennis_group.name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = os.path.join(output_dir, filename)
        
        # Prepare report data
        data = {
            'player_name': report.student.name,
            'coach_name': report.coach.name,
            'term': report.teaching_period.name,
            'group': report.tennis_group.name,
            'content': report.content,
            'recommended_group': report.recommended_group.name if report.recommended_group else None,
            'teaching_period': {
                'next_period_start_date': report.teaching_period.next_period_start_date.strftime('%Y-%m-%d') if report.teaching_period.next_period_start_date else None,
                'bookings_open_date': report.teaching_period.bookings_open_date.strftime('%Y-%m-%d') if report.teaching_period.bookings_open_date else None
            },
            'report': report
        }
        
        # Generate the report - check for school groups first
        if generator.is_school_group(report.tennis_group.name):
            generator.generate_schools_letter(output_path)
        else:
            # Get template path for non-school groups
            template_path = generator.get_template_path(report.tennis_group.name)
            
            if template_path:
                generator.generate_report(template_path, output_path, data)
            else:
                generator._generate_generic_report(data, output_path)
        
        return {
            'success': True,
            'output_path': output_path,
            'report_data': data
        }

def main():
    """Main function to test report generation"""
    app = create_app()
    
    with app.app_context():
        try:
            # Check if a specific report ID was provided as command line argument
            import sys
            if len(sys.argv) > 1 and sys.argv[1].isdigit():
                report_id = int(sys.argv[1])
                
                try:
                    result = EnhancedWiltonReportGenerator.generate_single_report(report_id)
                    print(f"Report generated successfully: {result['output_path']}")
                    
                except Exception as e:
                    print(f"Error generating report: {str(e)}")
                    traceback.print_exc()
                    return
                    
            else:
                # Get the most recent teaching period
                period = TeachingPeriod.query.order_by(TeachingPeriod.start_date.desc()).first()
                if not period:
                    print("Error: No teaching periods found")
                    return
                
                # Generate reports
                results = EnhancedWiltonReportGenerator.batch_generate_reports(period.id)
                
                print(f"Reports generated: {results['success']}")
                print(f"Errors: {results['errors']}")
                if results['output_directory']:
                    print(f"Output directory: {results['output_directory']}")
            
                if results['errors'] > 0:
                    print("\nError details:")
                    for error in results['error_details']:
                        print(f"- {error}")
    
            
        except Exception as e:
            print(f"Error: {str(e)}")
            traceback.print_exc()

if __name__ == '__main__':
    main()